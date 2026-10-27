"""Client bao bọc gọi Google Gemini API theo SDK chính thức hiện hành (google-genai).

Xử lý:
- Tự động kiểm tra cấu hình khóa API.
- Thử lại có giới hạn (bounded exponential retry) cho lỗi tạm thời (429, 5xx).
- Xử lý timeout rõ ràng.
- Phân loại lỗi chi tiết (QuotaExceeded, InvalidApiKey, Timeout, SafetyBlocked, ServiceError).
- Dễ dàng thay thế hoặc giả lập trong kiểm thử (pytest).
"""
import asyncio
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Định nghĩa các ngoại lệ chuẩn hóa cho Chatbot
class GeminiError(Exception):
    """Lớp cơ sở cho các lỗi liên quan tới Gemini API."""
    def __init__(self, message: str, code: str = "GEMINI_ERROR", user_friendly_message: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.user_friendly_message = (
            user_friendly_message
            or "Hệ thống AI đang gặp sự cố khi xử lý câu hỏi. Vui lòng thử lại sau."
        )


class QuotaExceededError(GeminiError):
    """Lỗi hết hạn mức API (429 / Resource Exhausted)."""
    def __init__(self, message: str = "Quota exceeded"):
        super().__init__(
            message=message,
            code="QUOTA_EXCEEDED",
            user_friendly_message=(
                "Hệ thống đã đạt giới hạn hạn mức truy vấn AI hôm nay. "
                "Vui lòng thử lại sau hoặc liên hệ ban quản trị để được hỗ trợ."
            ),
        )


class InvalidApiKeyError(GeminiError):
    """Lỗi khóa API không hợp lệ hoặc chưa được cấu hình."""
    def __init__(self, message: str = "Invalid API key"):
        super().__init__(
            message=message,
            code="INVALID_API_KEY",
            user_friendly_message=(
                "Khóa cấu hình Gemini API chưa chính xác hoặc chưa được cấu hình. "
                "Vui lòng liên hệ ban quản trị hệ thống."
            ),
        )


class GeminiTimeoutError(GeminiError):
    """Lỗi quá thời gian phản hồi từ Gemini API."""
    def __init__(self, message: str = "Request timed out"):
        super().__init__(
            message=message,
            code="TIMEOUT",
            user_friendly_message=(
                "Dịch vụ AI phản hồi quá thời gian quy định. Vui lòng gửi lại câu hỏi sau giây lát."
            ),
        )


class SafetyBlockedError(GeminiError):
    """Lỗi bị bộ lọc an toàn của mô hình chặn."""
    def __init__(self, message: str = "Content blocked by safety filters"):
        super().__init__(
            message=message,
            code="SAFETY_BLOCKED",
            user_friendly_message=(
                "Nội dung câu hỏi hoặc phản hồi đã bị bộ lọc an toàn của hệ thống từ chối xử lý. "
                "Vui lòng điều chỉnh câu hỏi phù hợp với hoạt động câu lạc bộ."
            ),
        )


class GeminiClient:
    """Lớp giao tiếp duy nhất với Google Gemini API sử dụng google-genai SDK."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_model: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_dim: Optional[int] = None,
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
    ):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.chat_model = chat_model or settings.GEMINI_CHAT_MODEL
        self.embedding_model = embedding_model or settings.GEMINI_EMBEDDING_MODEL
        self.embedding_dim = embedding_dim or settings.EMBEDDING_DIM
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self._client = None

    @property
    def is_configured(self) -> bool:
        """Kiểm tra xem API key đã được cấu hình hay chưa."""
        return bool(self.api_key and self.api_key.strip() and self.api_key != "your_gemini_api_key_here")

    def _get_client(self):
        """Khởi tạo client chính thức từ google.genai."""
        if not self.is_configured:
            raise InvalidApiKeyError("GEMINI_API_KEY chưa được thiết lập trong biến môi trường.")
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def _classify_and_raise_error(self, exc: Exception) -> None:
        """Phân loại ngoại lệ từ thư viện và đưa ra lỗi chuẩn hóa."""
        err_msg = str(exc)
        lower_msg = err_msg.lower()

        logger.error(f"[GeminiClient] Lỗi khi gọi Gemini API: {type(exc).__name__}: {err_msg}")

        if isinstance(exc, (GeminiError, asyncio.TimeoutError)):
            if isinstance(exc, asyncio.TimeoutError):
                raise GeminiTimeoutError("Asyncio request timeout")
            raise exc

        if "429" in err_msg or "resource_exhausted" in lower_msg or "quota" in lower_msg:
            raise QuotaExceededError(err_msg)
        elif "401" in err_msg or "403" in err_msg or "api_key_invalid" in lower_msg or "invalid api key" in lower_msg:
            raise InvalidApiKeyError(err_msg)
        elif "safety" in lower_msg or "blocked" in lower_msg or "harm" in lower_msg:
            raise SafetyBlockedError(err_msg)
        elif "timeout" in lower_msg or "deadline" in lower_msg:
            raise GeminiTimeoutError(err_msg)
        else:
            raise GeminiError(
                message=f"Gemini API Error: {err_msg}",
                code="API_ERROR",
                user_friendly_message="Đã có lỗi xảy ra từ máy chủ AI. Vui lòng thử lại sau.",
            )

    async def _execute_with_retry(self, coro_func, *args, **kwargs):
        """Thực thi coroutine với cơ chế thử lại lũy tiến (exponential backoff) khi gặp lỗi tạm thời."""
        client = self._get_client()
        last_exception = None

        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.wait_for(
                    coro_func(client, *args, **kwargs),
                    timeout=self.timeout_seconds,
                )
            except asyncio.TimeoutError as e:
                logger.warning(f"[GeminiClient] Timeout lần {attempt}/{self.max_retries}")
                last_exception = e
                if attempt == self.max_retries:
                    self._classify_and_raise_error(e)
            except Exception as e:
                err_str = str(e).lower()
                is_transient = any(code in err_str for code in ["429", "500", "503", "504", "resource_exhausted", "unavailable"])
                last_exception = e

                if is_transient and attempt < self.max_retries:
                    backoff = (2 ** (attempt - 1)) * 1.0  # 1s, 2s, 4s
                    logger.warning(f"[GeminiClient] Gặp lỗi tạm thời ({e}), chờ {backoff}s để thử lại lần {attempt + 1}...")
                    await asyncio.sleep(backoff)
                    continue

                self._classify_and_raise_error(e)

        if last_exception:
            self._classify_and_raise_error(last_exception)

    async def generate_chat(
        self,
        contents: List[Any],
        system_instruction: Optional[str] = None,
        tools: Optional[List[Any]] = None,
        temperature: float = 0.3,
    ) -> Any:
        """Gọi mô hình sinh phản hồi hoặc chọn công cụ (Function Calling)."""
        from google.genai import types

        config_args: Dict[str, Any] = {
            "temperature": temperature,
        }
        if system_instruction:
            config_args["system_instruction"] = system_instruction
        if tools:
            config_args["tools"] = tools

        # Nếu có CHAT_THINKING_BUDGET và cấu hình hỗ trợ
        if hasattr(settings, "CHAT_THINKING_BUDGET") and settings.CHAT_THINKING_BUDGET == 0:
            try:
                config_args["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass

        config = types.GenerateContentConfig(**config_args)

        async def _call(client):
            return await client.aio.models.generate_content(
                model=self.chat_model,
                contents=contents,
                config=config,
            )

        return await self._execute_with_retry(_call)

    async def generate_chat_stream(
        self,
        contents: List[Any],
        system_instruction: Optional[str] = None,
        tools: Optional[List[Any]] = None,
        temperature: float = 0.3,
    ) -> AsyncIterator[Any]:
        """Gọi mô hình trả về luồng streaming phản hồi text."""
        from google.genai import types

        config_args: Dict[str, Any] = {
            "temperature": temperature,
        }
        if system_instruction:
            config_args["system_instruction"] = system_instruction
        if tools:
            config_args["tools"] = tools

        if hasattr(settings, "CHAT_THINKING_BUDGET") and settings.CHAT_THINKING_BUDGET == 0:
            try:
                config_args["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass

        config = types.GenerateContentConfig(**config_args)
        client = self._get_client()

        try:
            stream = await client.aio.models.generate_content_stream(
                model=self.chat_model,
                contents=contents,
                config=config,
            )
            async for chunk in stream:
                yield chunk
        except Exception as e:
            self._classify_and_raise_error(e)

    async def embed_text(
        self,
        text: str,
        task_type: str = "RETRIEVAL_QUERY",
        title: Optional[str] = None,
    ) -> List[float]:
        """Tạo embedding cho một đoạn văn bản (truy vấn hoặc tài liệu đơn lẻ)."""
        from google.genai import types

        config_args: Dict[str, Any] = {
            "task_type": task_type,
            "output_dimensionality": self.embedding_dim,
        }
        if title and task_type == "RETRIEVAL_DOCUMENT":
            config_args["title"] = title

        config = types.EmbedContentConfig(**config_args)

        async def _call(client):
            response = await client.aio.models.embed_content(
                model=self.embedding_model,
                contents=text,
                config=config,
            )
            # Response có thể chứa embedding.values hoặc embeddings list
            if hasattr(response, "embedding") and response.embedding:
                return response.embedding.values
            elif hasattr(response, "embeddings") and response.embeddings:
                return response.embeddings[0].values
            raise GeminiError("Không nhận được vector embedding từ phản hồi của Gemini.")

        return await self._execute_with_retry(_call)

    async def embed_batch(
        self,
        texts: List[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
        titles: Optional[List[Optional[str]]] = None,
    ) -> List[List[float]]:
        """Tạo embedding cho danh sách các đoạn tài liệu theo lô."""
        if not texts:
            return []

        results = []
        # Chạy tuần tự hoặc nhóm nhỏ để tránh rate-limit
        for idx, text in enumerate(texts):
            title = titles[idx] if titles and idx < len(titles) else None
            vec = await self.embed_text(text=text, task_type=task_type, title=title)
            results.append(vec)
        return results


# Khởi tạo singleton Gemini client mặc định
gemini_client = GeminiClient()

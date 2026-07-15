from __future__ import annotations

from typing import Any, Dict, Optional


class ConversionError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "conversion_error",
        field: str = "",
        source_format: str = "",
        target_format: str = "",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.field = field
        self.source_format = source_format
        self.target_format = target_format
        self.details = dict(details or {})

    def as_dict(self) -> Dict[str, Any]:
        return {
            "message": str(self),
            "type": "conversion_error",
            "code": self.code,
            "param": self.field or None,
            "source_format": self.source_format or None,
            "target_format": self.target_format or None,
            "details": self.details,
        }

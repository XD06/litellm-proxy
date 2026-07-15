from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


CHAT = "chat_completions"
RESPONSES = "responses"
ANTHROPIC = "anthropic_messages"
FORMATS = (CHAT, RESPONSES, ANTHROPIC)


@dataclass
class ConversionAction:
    field: str
    action: str
    target: str = ""
    detail: str = ""

    def as_dict(self) -> Dict[str, Any]:
        out = {"field": self.field, "action": self.action}
        if self.target:
            out["target"] = self.target
        if self.detail:
            out["detail"] = self.detail
        return out


@dataclass
class ConversionReport:
    source_format: str
    target_format: str
    actions: List[ConversionAction] = field(default_factory=list)

    def add(self, field: str, action: str, *, target: str = "", detail: str = "") -> None:
        candidate = ConversionAction(field=field, action=action, target=target, detail=detail)
        if candidate not in self.actions:
            self.actions.append(candidate)

    @property
    def blockers(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(item.field for item in self.actions if item.action == "block"))

    @property
    def allowed(self) -> bool:
        return not self.blockers

    @property
    def fidelity(self) -> str:
        actions = {item.action for item in self.actions}
        if "block" in actions:
            return "blocked"
        if "safe_drop" in actions:
            return "safe_drop"
        if "stateful" in actions:
            return "stateful"
        if "map" in actions:
            return "mapped"
        return "lossless"

    def actions_for(self, field: str) -> List[ConversionAction]:
        return [item for item in self.actions if item.field == field]

    def as_dict(self) -> Dict[str, Any]:
        return {
            "source_format": self.source_format,
            "target_format": self.target_format,
            "allowed": self.allowed,
            "fidelity": self.fidelity,
            "blockers": list(self.blockers),
            "actions": [item.as_dict() for item in self.actions],
        }


@dataclass
class ContentBlock:
    kind: str
    text: str = ""
    call_id: str = ""
    name: str = ""
    arguments: str = ""
    input: Any = None
    output: Any = None
    is_error: bool = False
    url: str = ""
    data: str = ""
    media_type: str = ""
    file_id: str = ""
    file_url: str = ""
    filename: str = ""
    detail: str = ""
    signature: str = ""
    encrypted_content: str = ""
    status: str = ""
    source_format: str = ""
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentTurn:
    role: str
    content: List[ContentBlock] = field(default_factory=list)
    name: str = ""
    status: str = ""
    item_id: str = ""


@dataclass
class AgentTool:
    kind: str
    name: str
    description: str = ""
    input_schema: Dict[str, Any] = field(default_factory=dict)
    strict: Optional[bool] = None
    format: Dict[str, Any] = field(default_factory=dict)
    allowed_callers: List[str] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentToolChoice:
    mode: str = "auto"
    name: str = ""
    kind: str = "function"
    parallel: Optional[bool] = None


@dataclass
class AgentRequest:
    source_format: str
    model: str
    system: List[ContentBlock] = field(default_factory=list)
    turns: List[AgentTurn] = field(default_factory=list)
    tools: List[AgentTool] = field(default_factory=list)
    tool_choice: AgentToolChoice = field(default_factory=AgentToolChoice)
    max_output_tokens: Optional[int] = None
    stop_sequences: List[str] = field(default_factory=list)
    stream: bool = False
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    reasoning: Dict[str, Any] = field(default_factory=dict)
    structured_output: Dict[str, Any] = field(default_factory=dict)
    state: Dict[str, Any] = field(default_factory=dict)
    hints: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_details: Dict[str, Any] = field(default_factory=dict)
    output_details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResponse:
    source_format: str
    response_id: str
    model: str
    items: List[ContentBlock] = field(default_factory=list)
    status: str = "completed"
    stop_reason: str = "stop"
    stop_sequence: Optional[str] = None
    usage: Usage = field(default_factory=Usage)
    created_at: Optional[int] = None
    error: Optional[Dict[str, Any]] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversionContext:
    source_format: str
    target_format: str
    custom_tool_names: set[str] = field(default_factory=set)
    tool_name_to_original: Dict[str, str] = field(default_factory=dict)
    original_tool_to_wire: Dict[str, str] = field(default_factory=dict)
    synthetic_output_tool: str = ""
    report: Optional[ConversionReport] = None
    session_store: Any = None
    session_request: Dict[str, Any] = field(default_factory=dict)
    session_expanded_from: str = ""


@dataclass
class PreparedRequest:
    payload: Dict[str, Any]
    context: ConversionContext
    report: ConversionReport
    request: AgentRequest


ModelResolver = Callable[[str], str]

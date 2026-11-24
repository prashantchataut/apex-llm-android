//! Chat templates + Apex system prompt.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub role: String, // system | user | assistant
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatTemplate {
    ChatMl, // Qwen, SmolLM2, many fine-tunes
    Llama3, // Llama 3.x
    Gemma,  // Gemma 2/3 (no system role: folded into first user turn)
}

pub const APEX_SYSTEM_PROMPT: &str =
    "You are Apex, a private on-device assistant. Be concise and exact. \
Use $...$ for inline math and $$...$$ for block math. When you need the user to choose, \
reply with a JSON object {\"question\": string, \"options\": string[]}.";

impl ChatTemplate {
    /// Infer from a GGUF filename / repo id (best-effort; GGUF metadata wins when available).
    pub fn guess(name: &str) -> Self {
        let n = name.to_ascii_lowercase();
        if n.contains("llama-3") || n.contains("llama3") {
            Self::Llama3
        } else if n.contains("gemma") {
            Self::Gemma
        } else {
            Self::ChatMl
        }
    }

    /// Render messages and open the assistant turn.
    pub fn render(&self, msgs: &[Message]) -> String {
        let mut s = String::new();
        match self {
            Self::ChatMl => {
                for m in msgs {
                    s += &format!("<|im_start|>{}\n{}<|im_end|>\n", m.role, m.content);
                }
                s += "<|im_start|>assistant\n";
            }
            Self::Llama3 => {
                s += "<|begin_of_text|>";
                for m in msgs {
                    s += &format!(
                        "<|start_header_id|>{}<|end_header_id|>\n\n{}<|eot_id|>",
                        m.role, m.content
                    );
                }
                s += "<|start_header_id|>assistant<|end_header_id|>\n\n";
            }
            Self::Gemma => {
                let mut pending_system = String::new();
                for m in msgs {
                    match m.role.as_str() {
                        "system" => pending_system = format!("{}\n\n", m.content),
                        r => {
                            let role = if r == "assistant" { "model" } else { "user" };
                            let body = if role == "user" {
                                format!("{}{}", std::mem::take(&mut pending_system), m.content)
                            } else {
                                m.content.clone()
                            };
                            s += &format!("<start_of_turn>{role}\n{body}<end_of_turn>\n");
                        }
                    }
                }
                s += "<start_of_turn>model\n";
            }
        }
        s
    }

    pub fn stop_tokens(&self) -> &'static [&'static str] {
        match self {
            Self::ChatMl => &["<|im_end|>"],
            Self::Llama3 => &["<|eot_id|>"],
            Self::Gemma => &["<end_of_turn>"],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(r: &str, c: &str) -> Message {
        Message {
            role: r.into(),
            content: c.into(),
        }
    }

    #[test]
    fn guess_templates() {
        assert_eq!(
            ChatTemplate::guess("Llama-3.2-3B-Instruct-Q4_K_M.gguf"),
            ChatTemplate::Llama3
        );
        assert_eq!(ChatTemplate::guess("gemma-2-2b-it"), ChatTemplate::Gemma);
        assert_eq!(ChatTemplate::guess("qwen2.5-3b"), ChatTemplate::ChatMl);
    }

    #[test]
    fn chatml_render() {
        let out = ChatTemplate::ChatMl.render(&[m("system", "S"), m("user", "U")]);
        assert_eq!(out, "<|im_start|>system\nS<|im_end|>\n<|im_start|>user\nU<|im_end|>\n<|im_start|>assistant\n");
    }

    #[test]
    fn gemma_folds_system_into_user() {
        let out = ChatTemplate::Gemma.render(&[m("system", "S"), m("user", "U")]);
        assert!(out.starts_with("<start_of_turn>user\nS\n\nU<end_of_turn>"));
        assert!(out.ends_with("<start_of_turn>model\n"));
    }
}

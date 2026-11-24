//! Unified provider router. Model ids use an optional `provider:` prefix:
//! `openrouter:meta-llama/llama-3.1-70b-instruct`, `anthropic:claude-…`, `groq:…`,
//! `openai:gpt-…`; anything else (or `local:`) runs on-device.

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Provider {
    Local,
    OpenRouter,
    Anthropic,
    OpenAi,
    Groq,
}

impl Provider {
    pub fn parse_prefix(p: &str) -> Option<Provider> {
        Some(match p {
            "local" => Provider::Local,
            "openrouter" => Provider::OpenRouter,
            "anthropic" => Provider::Anthropic,
            "openai" => Provider::OpenAi,
            "groq" => Provider::Groq,
            _ => return None,
        })
    }
    pub fn name(&self) -> &'static str {
        match self {
            Provider::Local => "local",
            Provider::OpenRouter => "openrouter",
            Provider::Anthropic => "anthropic",
            Provider::OpenAi => "openai",
            Provider::Groq => "groq",
        }
    }
    pub fn base_url(&self) -> Option<&'static str> {
        match self {
            Provider::Local => None,
            Provider::OpenRouter => Some("https://openrouter.ai/api/v1"),
            Provider::Anthropic => Some("https://api.anthropic.com/v1"),
            Provider::OpenAi => Some("https://api.openai.com/v1"),
            Provider::Groq => Some("https://api.groq.com/openai/v1"),
        }
    }
    /// Anthropic uses `/messages` + `x-api-key`; the rest speak OpenAI `/chat/completions`.
    pub fn chat_path(&self) -> &'static str {
        if *self == Provider::Anthropic {
            "/messages"
        } else {
            "/chat/completions"
        }
    }
    pub fn auth_headers(&self, key: &str) -> Vec<(&'static str, String)> {
        match self {
            Provider::Anthropic => vec![
                ("x-api-key", key.to_string()),
                ("anthropic-version", "2023-06-01".to_string()),
            ],
            _ => vec![("authorization", format!("Bearer {key}"))],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub provider: Provider,
    pub model: String,
    /// Full chat URL for remote providers; `None` = run locally.
    pub url: Option<String>,
}

#[derive(Default)]
pub struct ProviderRouter {
    keys: HashMap<Provider, String>,
}

impl ProviderRouter {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn set_key(&mut self, p: Provider, key: String) {
        self.keys.insert(p, key);
    }
    pub fn key(&self, p: Provider) -> Option<&str> {
        self.keys.get(&p).map(String::as_str)
    }

    pub fn resolve(&self, model_id: &str) -> Route {
        let (provider, model) = match model_id
            .split_once(':')
            .and_then(|(p, m)| Provider::parse_prefix(p).map(|p| (p, m)))
        {
            Some((p, m)) => (p, m.to_string()),
            None => (Provider::Local, model_id.to_string()),
        };
        let url = provider
            .base_url()
            .map(|b| format!("{b}{}", provider.chat_path()));
        Route {
            provider,
            model,
            url,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_by_prefix() {
        let r = ProviderRouter::new();
        let a = r.resolve("groq:llama-3.3-70b-versatile");
        assert_eq!(
            (a.provider, a.model.as_str()),
            (Provider::Groq, "llama-3.3-70b-versatile")
        );
        assert_eq!(
            a.url.as_deref(),
            Some("https://api.groq.com/openai/v1/chat/completions")
        );
        assert_eq!(
            r.resolve("anthropic:claude-x").url.as_deref(),
            Some("https://api.anthropic.com/v1/messages")
        );
    }

    #[test]
    fn ollama_style_tags_stay_local() {
        let r = ProviderRouter::new();
        let a = r.resolve("qwen2.5:3b");
        assert_eq!(
            (a.provider, a.model.as_str(), a.url),
            (Provider::Local, "qwen2.5:3b", None)
        );
        assert_eq!(r.resolve("llama3").provider, Provider::Local);
    }

    #[test]
    fn auth_header_styles() {
        assert_eq!(Provider::Anthropic.auth_headers("k")[0].0, "x-api-key");
        assert_eq!(Provider::OpenAi.auth_headers("k")[0].1, "Bearer k");
    }
}

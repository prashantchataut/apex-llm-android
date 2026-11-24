//! Pure-Rust byte-level BPE tokenizer built from the vocabulary stored *inside* a GGUF file
//! (`tokenizer.ggml.tokens`, `tokenizer.ggml.merges`, `tokenizer.ggml.token_type`).
//! No C/C++, no `tokenizer.json`: works for the GPT-2 family used by Qwen2/2.5 and SmolLM2.

use fancy_regex::Regex;
use std::collections::HashMap;

/// GGUF `token_type` values we care about.
const TYPE_CONTROL: i32 = 3;
const TYPE_USER_DEFINED: i32 = 4;

/// Pre-tokenizer flavour (GGUF `tokenizer.ggml.pre`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreTokenizer {
    Gpt2,
    Qwen2,
    /// SmolLM: digits are split one by one, otherwise GPT-2 rules.
    SmolLm,
}

impl PreTokenizer {
    pub fn from_gguf(name: Option<&str>) -> Self {
        match name {
            Some("qwen2") | Some("qwen35") => Self::Qwen2,
            Some("smollm") => Self::SmolLm,
            _ => Self::Gpt2,
        }
    }

    fn pattern(self) -> &'static str {
        match self {
            Self::Qwen2 => {
                r"(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+"
            }
            Self::SmolLm => {
                r"\p{N}|'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+"
            }
            Self::Gpt2 => {
                r"'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+"
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TokenizerError {
    #[error("invalid pre-tokenizer pattern: {0}")]
    Pattern(String),
    #[error("vocabulary is empty")]
    EmptyVocab,
}

pub struct BpeTokenizer {
    tokens: Vec<String>,
    ids: HashMap<String, u32>,
    ranks: HashMap<(String, String), u32>,
    /// Control / user-defined tokens (`<|im_start|>` …), longest first.
    specials: Vec<(String, u32)>,
    pre: Regex,
    byte_to_char: [char; 256],
    char_to_byte: HashMap<char, u8>,
    pub bos: Option<u32>,
    pub eos: Vec<u32>,
}

/// GPT-2 `bytes_to_unicode`: printable bytes map to themselves, the rest to U+0100…
fn byte_maps() -> ([char; 256], HashMap<char, u8>) {
    let mut keep: Vec<u32> = (b'!' as u32..=b'~' as u32).collect();
    keep.extend(0xA1..=0xAC);
    keep.extend(0xAE..=0xFF);
    let mut table = ['\0'; 256];
    let mut rev = HashMap::new();
    let mut extra = 0u32;
    for b in 0u32..256 {
        let c = if keep.contains(&b) {
            char::from_u32(b)
        } else {
            let c = char::from_u32(256 + extra);
            extra += 1;
            c
        }
        .unwrap_or('?');
        table[b as usize] = c;
        rev.insert(c, b as u8);
    }
    (table, rev)
}

impl BpeTokenizer {
    pub fn new(
        tokens: Vec<String>,
        merges: &[String],
        token_types: &[i32],
        pre: PreTokenizer,
        bos: Option<u32>,
        eos: Vec<u32>,
    ) -> Result<Self, TokenizerError> {
        if tokens.is_empty() {
            return Err(TokenizerError::EmptyVocab);
        }
        let mut ids = HashMap::with_capacity(tokens.len());
        for (i, t) in tokens.iter().enumerate() {
            ids.entry(t.clone()).or_insert(i as u32);
        }
        let mut ranks = HashMap::with_capacity(merges.len());
        for (rank, m) in merges.iter().enumerate() {
            if let Some((a, b)) = m.split_once(' ') {
                ranks.insert((a.to_string(), b.to_string()), rank as u32);
            }
        }
        let mut specials: Vec<(String, u32)> = token_types
            .iter()
            .enumerate()
            .filter(|(_, t)| **t == TYPE_CONTROL || **t == TYPE_USER_DEFINED)
            .filter_map(|(i, _)| tokens.get(i).map(|s| (s.clone(), i as u32)))
            .filter(|(s, _)| s.len() > 1)
            .collect();
        specials.sort_by_key(|(s, _)| std::cmp::Reverse(s.len()));
        let (byte_to_char, char_to_byte) = byte_maps();
        let pre = Regex::new(pre.pattern()).map_err(|e| TokenizerError::Pattern(e.to_string()))?;
        Ok(Self {
            tokens,
            ids,
            ranks,
            specials,
            pre,
            byte_to_char,
            char_to_byte,
            bos,
            eos,
        })
    }

    pub fn vocab_size(&self) -> usize {
        self.tokens.len()
    }

    pub fn token_id(&self, s: &str) -> Option<u32> {
        self.ids.get(s).copied()
    }

    fn bpe_word(&self, word: &str, out: &mut Vec<u32>) {
        let mut syms: Vec<String> = word
            .bytes()
            .map(|b| self.byte_to_char[b as usize].to_string())
            .collect();
        loop {
            let mut best: Option<(u32, usize)> = None;
            for i in 0..syms.len().saturating_sub(1) {
                if let Some(&r) = self.ranks.get(&(syms[i].clone(), syms[i + 1].clone())) {
                    if best.is_none_or(|(br, _)| r < br) {
                        best = Some((r, i));
                    }
                }
            }
            let Some((_, i)) = best else { break };
            let merged = format!("{}{}", syms[i], syms[i + 1]);
            syms[i] = merged;
            syms.remove(i + 1);
        }
        for s in syms {
            if let Some(&id) = self.ids.get(&s) {
                out.push(id);
            } else {
                // Unknown merge result: fall back to single byte-chars.
                for c in s.chars() {
                    if let Some(&id) = self.ids.get(&c.to_string()) {
                        out.push(id);
                    }
                }
            }
        }
    }

    fn encode_plain(&self, text: &str, out: &mut Vec<u32>) {
        for m in self.pre.find_iter(text).flatten() {
            self.bpe_word(m.as_str(), out);
        }
    }

    /// Encode `text`. With `parse_special`, literal `<|im_start|>`-style tokens become single ids.
    pub fn encode(&self, text: &str, parse_special: bool) -> Vec<u32> {
        let mut out = Vec::new();
        if !parse_special || self.specials.is_empty() {
            self.encode_plain(text, &mut out);
            return out;
        }
        let mut rest = text;
        while !rest.is_empty() {
            // earliest special token occurrence (longest wins on ties)
            let hit = self
                .specials
                .iter()
                .filter_map(|(s, id)| rest.find(s.as_str()).map(|p| (p, s.len(), *id)))
                .min_by_key(|(p, len, _)| (*p, std::cmp::Reverse(*len)));
            match hit {
                Some((pos, len, id)) => {
                    self.encode_plain(&rest[..pos], &mut out);
                    out.push(id);
                    rest = &rest[pos + len..];
                }
                None => {
                    self.encode_plain(rest, &mut out);
                    break;
                }
            }
        }
        out
    }

    /// Raw bytes for one token (control tokens render as their literal text).
    pub fn token_bytes(&self, id: u32) -> Vec<u8> {
        let Some(t) = self.tokens.get(id as usize) else {
            return Vec::new();
        };
        if self.specials.iter().any(|(_, sid)| *sid == id) {
            return t.as_bytes().to_vec();
        }
        t.chars()
            .filter_map(|c| self.char_to_byte.get(&c).copied())
            .collect()
    }

    pub fn is_eos(&self, id: u32) -> bool {
        self.eos.contains(&id)
    }

    pub fn decode(&self, ids: &[u32]) -> String {
        let bytes: Vec<u8> = ids.iter().flat_map(|i| self.token_bytes(*i)).collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

/// Incremental UTF-8 decoder: holds back incomplete multi-byte sequences between tokens.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        match std::str::from_utf8(&self.pending) {
            Ok(s) => {
                let out = s.to_string();
                self.pending.clear();
                out
            }
            Err(e) => {
                let valid = e.valid_up_to();
                let out = String::from_utf8_lossy(&self.pending[..valid]).into_owned();
                if e.error_len().is_some() {
                    // genuinely invalid bytes: drop them rather than stall
                    self.pending.clear();
                    out + "\u{FFFD}"
                } else {
                    self.pending.drain(..valid);
                    out
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tiny synthetic GPT-2 style vocab: bytes + a few merges + a special token.
    fn toy() -> BpeTokenizer {
        let (table, _) = byte_maps();
        let mut tokens: Vec<String> = (0..256).map(|b| table[b].to_string()).collect();
        let g = table[b' ' as usize]; // 'Ġ'
        let merges = vec![
            "h e".to_string(),
            "l l".to_string(),
            "he ll".to_string(),
            "hell o".to_string(),
            format!("{g} w"),
        ];
        tokens.push("he".into());
        tokens.push("ll".into());
        tokens.push("hell".into());
        tokens.push("hello".into());
        tokens.push(format!("{g}w"));
        tokens.push("<|im_start|>".into());
        let mut types = vec![1; tokens.len()];
        *types.last_mut().unwrap() = TYPE_CONTROL;
        BpeTokenizer::new(tokens, &merges, &types, PreTokenizer::Gpt2, None, vec![]).unwrap()
    }

    #[test]
    fn merges_apply_in_rank_order() {
        let t = toy();
        let ids = t.encode("hello", false);
        assert_eq!(ids.len(), 1);
        assert_eq!(t.token_id("hello"), Some(ids[0]));
    }

    #[test]
    fn roundtrips_unicode_and_whitespace() {
        let t = toy();
        for s in ["hello world", "  héllo\n\nwörld — 日本語 🦀", "a  b\tc"] {
            assert_eq!(t.decode(&t.encode(s, false)), s, "roundtrip of {s:?}");
        }
    }

    #[test]
    fn special_tokens_are_single_ids() {
        let t = toy();
        let ids = t.encode("<|im_start|>hello", true);
        assert_eq!(ids.len(), 2);
        assert_eq!(t.token_id("<|im_start|>"), Some(ids[0]));
        // Without parsing, the literal is split into byte pieces.
        assert!(t.encode("<|im_start|>", false).len() > 1);
    }

    #[test]
    fn utf8_stream_holds_back_partial_sequences() {
        let crab = "🦀".as_bytes();
        let mut s = Utf8Stream::default();
        assert_eq!(s.push(&crab[..2]), "");
        assert_eq!(s.push(&crab[2..]), "🦀");
    }
}

//! Streaming `<think>…</think>` state machine. Tags may be split across token
//! boundaries (`"<th"` + `"ink>"`), so we hold back the longest suffix that
//! could still become a tag.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThinkEvent {
    /// Visible answer text.
    Text(String),
    /// Reasoning text (inside `<think>`).
    Thought(String),
    ThinkStart,
    ThinkEnd,
}

#[derive(Debug, Default)]
pub struct ThinkParser {
    buf: String,
    inside: bool,
}

const OPEN: &str = "<think>";
const CLOSE: &str = "</think>";

impl ThinkParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn in_think(&self) -> bool {
        self.inside
    }

    fn emit(&self, s: &str, out: &mut Vec<ThinkEvent>) {
        if s.is_empty() {
            return;
        }
        out.push(if self.inside {
            ThinkEvent::Thought(s.to_string())
        } else {
            ThinkEvent::Text(s.to_string())
        });
    }

    pub fn feed(&mut self, chunk: &str) -> Vec<ThinkEvent> {
        self.buf.push_str(chunk);
        let mut out = Vec::new();
        loop {
            let tag = if self.inside { CLOSE } else { OPEN };
            if let Some(i) = self.buf.find(tag) {
                let before: String = self.buf.drain(..i).collect();
                self.emit(&before, &mut out);
                self.buf.drain(..tag.len());
                out.push(if self.inside {
                    ThinkEvent::ThinkEnd
                } else {
                    ThinkEvent::ThinkStart
                });
                self.inside = !self.inside;
                continue;
            }
            // Hold back the longest suffix that is a proper prefix of `tag`.
            let hold = (1..tag.len())
                .rev()
                .find(|&k| k <= self.buf.len() && self.buf.ends_with(&tag[..k]))
                .unwrap_or(0);
            let cut = self.buf.len() - hold;
            let ready: String = self.buf.drain(..cut).collect();
            self.emit(&ready, &mut out);
            break;
        }
        out
    }

    /// Stream ended — flush whatever is held back as plain content.
    pub fn finish(&mut self) -> Vec<ThinkEvent> {
        let rest = std::mem::take(&mut self.buf);
        let mut out = Vec::new();
        self.emit(&rest, &mut out);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ThinkEvent::*;

    fn run(chunks: &[&str]) -> Vec<ThinkEvent> {
        let mut p = ThinkParser::new();
        let mut all = vec![];
        for c in chunks {
            all.extend(p.feed(c));
        }
        all.extend(p.finish());
        // merge adjacent same-kind events for easy comparison
        let mut merged: Vec<ThinkEvent> = vec![];
        for e in all {
            match (merged.last_mut(), &e) {
                (Some(Text(a)), Text(b)) => a.push_str(b),
                (Some(Thought(a)), Thought(b)) => a.push_str(b),
                _ => merged.push(e),
            }
        }
        merged
    }

    #[test]
    fn simple() {
        assert_eq!(
            run(&["<think>hmm</think>42"]),
            [
                ThinkStart,
                Thought("hmm".into()),
                ThinkEnd,
                Text("42".into())
            ]
        );
    }

    #[test]
    fn tags_split_across_chunks() {
        let ev = run(&["<th", "ink>re", "ason</thi", "nk>ans", "wer"]);
        assert_eq!(
            ev,
            [
                ThinkStart,
                Thought("reason".into()),
                ThinkEnd,
                Text("answer".into())
            ]
        );
    }

    #[test]
    fn lone_angle_bracket_is_text() {
        assert_eq!(run(&["a < b and 1<2"]), [Text("a < b and 1<2".into())]);
    }

    #[test]
    fn unterminated_think_flushes_as_thought() {
        assert_eq!(
            run(&["<think>still going"]),
            [ThinkStart, Thought("still going".into())]
        );
    }

    #[test]
    fn multibyte_is_safe() {
        assert_eq!(
            run(&["<think>日本", "語</think>✓"]),
            [
                ThinkStart,
                Thought("日本語".into()),
                ThinkEnd,
                Text("✓".into())
            ]
        );
    }
}

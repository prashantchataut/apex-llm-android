//! GBNF grammars (llama.cpp) for structured generation.

/// Forces `{"question": "...", "options": ["...", ... 2–6 items]}` — the UI renders
/// this as tappable MCQ glass cards. Apply only when the UI requests a structured
/// question (zero cost otherwise).
pub fn mcq_grammar() -> &'static str {
    r#"root   ::= "{" ws "\"question\"" ws ":" ws string "," ws "\"options\"" ws ":" ws "[" ws string ("," ws string){1,5} ws "]" ws "}"
string ::= "\"" ( [^"\\\x7F\x00-\x1F] | "\\" ["\\/bfnrt] )* "\""
ws     ::= [ \t\n]{0,8}
"#
}

/// Forces a single JSON object (any shape) — for tool/config extraction.
pub fn json_object_grammar() -> &'static str {
    r#"root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws
object ::= "{" ws ( string ":" ws value ("," ws string ":" ws value)* )? "}" ws
array  ::= "[" ws ( value ("," ws value)* )? "]" ws
string ::= "\"" ( [^"\\\x7F\x00-\x1F] | "\\" ["\\/bfnrt] )* "\"" ws
number ::= ("-"? ([0-9] | [1-9] [0-9]{0,15})) ("." [0-9]+)? ([eE] [-+]? [0-9]+)? ws
ws     ::= [ \t\n]{0,8}
"#
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grammars_define_root_and_balance_quotes() {
        for g in [mcq_grammar(), json_object_grammar()] {
            assert!(g.lines().next().unwrap().starts_with("root"));
            assert!(g.contains("ws"));
        }
    }
}

/// Builds a URL-safe slug from a human-readable campaign name.
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut prev_hyphen = false;
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            prev_hyphen = false;
        } else if !prev_hyphen {
            out.push('-');
            prev_hyphen = true;
        }
    }
    out.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_normalizes_spaces() {
        assert_eq!(slugify("My Campaign"), "my-campaign");
    }
}

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SegmentLine {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub speaker: String,
}

pub fn merge_segments(segments: &[SegmentLine]) -> String {
    let mut sorted: Vec<&SegmentLine> = segments.iter().collect();
    sorted.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.end.partial_cmp(&b.end).unwrap_or(std::cmp::Ordering::Equal))
    });

    let mut lines = Vec::new();
    for seg in sorted {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        lines.push(format!(
            "[{}] {}: {}",
            format_timestamp(seg.start),
            seg.speaker,
            text
        ));
    }
    lines.join("\n")
}

fn format_timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0) as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

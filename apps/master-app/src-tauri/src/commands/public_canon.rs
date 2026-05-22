use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicCanonBuildPreview {
    pub message: String,
    pub sample_input_relative: String,
    pub cli_hint: String,
}

/// Pilot hook for the Node SSG (`tools/build-public-canon`). Full publish will export
/// `public_canon` entities from SQLite and upload the generated `dist/` to S3.
#[tauri::command]
pub async fn preview_public_canon_build(_campaign_id: String) -> Result<PublicCanonBuildPreview, String> {
    Ok(PublicCanonBuildPreview {
        message: "Public canon SSG is available via the amber-build-public-canon CLI.".into(),
        sample_input_relative: "tools/build-public-canon/fixtures/sample-campaign-public.json".into(),
        cli_hint: "pnpm --filter @amber/build-public-canon build && node tools/build-public-canon/dist/cli.js --input tools/build-public-canon/fixtures/sample-campaign-public.json --out /tmp/public-canon-preview".into(),
    })
}

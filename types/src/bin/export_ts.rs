#[cfg(feature = "ts")]
use std::fs;

#[cfg(feature = "ts")]
fn main() {
    use std::path::PathBuf;

    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/types/src/generated");

    if let Err(err) = nullspace_types::casino_state::export_ts(&out_dir)
        .and_then(|_| fix_import_extensions(&out_dir))
    {
        eprintln!("Failed to export TS bindings: {err}");
        std::process::exit(1);
    }
}

#[cfg(feature = "ts")]
fn fix_import_extensions(out_dir: &std::path::Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(out_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("ts") {
            continue;
        }
        let contents = fs::read_to_string(&path)?;
        let mut changed = false;
        let mut output = String::with_capacity(contents.len());
        for line in contents.lines() {
            if line.contains("from \"./") && line.ends_with("\";") && !line.contains(".js\"") {
                let fixed = line.replace("\";", ".js\";");
                output.push_str(&fixed);
                output.push('\n');
                changed = true;
            } else {
                output.push_str(line);
                output.push('\n');
            }
        }
        if changed {
            fs::write(&path, output)?;
        }
    }
    Ok(())
}

#[cfg(not(feature = "ts"))]
fn main() {
    eprintln!("Enable the 'ts' feature to export TypeScript bindings.");
    std::process::exit(1);
}

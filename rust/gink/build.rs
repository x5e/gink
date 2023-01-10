use std::{env, fs, io, path};

fn main() -> io::Result<()> {
    // generate Rust from .proto files
    let mut proto_dir = path::PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    proto_dir.push("..");
    proto_dir.push("..");
    proto_dir.push("proto");
    // find all proto files
    let proto_files = fs::read_dir(&proto_dir)?
        .map(|r| r.expect("could not read dir entry"))
        .filter(|de| de.file_name().to_str().expect("filename not UTF-8").ends_with(".proto"))
        .map(|de| de.path())
        .collect::<Vec<_>>();
    prost_build::compile_protos(&proto_files, &[&proto_dir])?;
    Ok(())
}

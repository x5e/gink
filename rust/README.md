# Quick start

- Install Rust toolchain: https://rustup.rs/
- Run it: `RUST_LOG=debug cargo run -- --help`
    - The extra `--` indicates to pass `--help` to the program rather than the
      build tool `cargo`
    - Set the `RUST_LOG` env var to the desired verbosity as
      per [env_logger](https://crates.io/crates/env_logger)
    - Use `run --release` instead of `run` to use an optimized build
- See the [Rust Book](https://doc.rust-lang.org/book/) for more info
- See [crates.io](https://crates.io/) to find libraries for anything

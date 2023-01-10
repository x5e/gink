use clap::Parser as _;

mod proto {
    include!(concat!(env!("OUT_DIR"), "/google.gink.rs"));
}

mod server;

#[tokio::main]
async fn main() {
    env_logger::init();

    match &Cli::parse().command {
        Commands::Server { port } => server::serve(*port).await,
    }
}

#[derive(clap::Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(clap::Subcommand)]
enum Commands {
    Server {
        /// Port number to listen on
        #[arg(short, long)]
        port: u16,
    },
}

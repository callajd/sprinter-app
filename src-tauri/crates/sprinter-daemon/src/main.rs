mod executor;
mod lifecycle;
mod server;

use clap::Parser;
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "sprinter-daemon", about = "Sprinter command executor daemon")]
struct Args {
    /// Data directory (default: ~/.sprinter)
    #[arg(long)]
    data_dir: Option<PathBuf>,

    /// Log level filter (e.g., "info", "debug", "sprinter_daemon=trace")
    #[arg(long, default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&args.log_level)),
        )
        .init();

    let data_dir = args
        .data_dir
        .unwrap_or_else(|| dirs_data_dir().expect("could not determine home directory"));

    std::fs::create_dir_all(&data_dir)?;

    // Check for existing daemon
    lifecycle::check_existing_daemon(&data_dir)?;

    // Start gRPC server
    let addr = lifecycle::bind_address()?;
    let db_path = data_dir.join("commands.db");
    let db = sprinter_common::db::Database::open(&db_path)?;

    let executor = executor::CommandExecutor::new(db);
    let service = server::CommandServiceImpl::new(executor);

    // Write PID and port files
    lifecycle::write_pid_file(&data_dir)?;
    lifecycle::write_port_file(&data_dir, addr.port())?;

    tracing::info!("Daemon starting on {}", addr);

    let shutdown_data_dir = data_dir.clone();
    tonic::transport::Server::builder()
        .add_service(sprinter_proto::command_service_server::CommandServiceServer::new(service))
        .serve_with_shutdown(addr, async {
            tokio::signal::ctrl_c().await.ok();
            tracing::info!("Shutting down daemon");
            lifecycle::cleanup(&shutdown_data_dir);
        })
        .await?;

    Ok(())
}

fn dirs_data_dir() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".sprinter"))
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

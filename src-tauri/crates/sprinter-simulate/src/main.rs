use clap::Parser;
use rand::Rng;
use std::io::Write;
use std::time::{Duration, Instant};

#[derive(Parser, Debug)]
#[command(name = "sprinter-simulate", about = "Simulated command for testing the Sprinter command executor")]
struct Args {
    /// Total duration to run (e.g., "5s", "10s", "1m")
    #[arg(long, default_value = "5s", value_parser = parse_duration)]
    duration: Duration,

    /// Exit code to return on completion
    #[arg(long, default_value = "0")]
    exit_code: i32,

    /// Interval between output lines (e.g., "500ms", "1s")
    #[arg(long, default_value = "1s", value_parser = parse_duration)]
    interval: Duration,

    /// Message template for each output line
    #[arg(long, default_value = "Simulated output")]
    message: String,

    /// Fraction of lines sent to stderr (0.0 - 1.0)
    #[arg(long, default_value = "0.0")]
    stderr_ratio: f64,
}

fn parse_duration(s: &str) -> Result<Duration, String> {
    let s = s.trim();
    if let Some(ms) = s.strip_suffix("ms") {
        ms.parse::<u64>()
            .map(Duration::from_millis)
            .map_err(|e| e.to_string())
    } else if let Some(secs) = s.strip_suffix('s') {
        secs.parse::<f64>()
            .map(Duration::from_secs_f64)
            .map_err(|e| e.to_string())
    } else if let Some(mins) = s.strip_suffix('m') {
        mins.parse::<f64>()
            .map(|m| Duration::from_secs_f64(m * 60.0))
            .map_err(|e| e.to_string())
    } else {
        // Default to seconds
        s.parse::<f64>()
            .map(Duration::from_secs_f64)
            .map_err(|e| format!("Invalid duration '{}': {}", s, e))
    }
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let start = Instant::now();
    let total_lines = (args.duration.as_millis() / args.interval.as_millis().max(1)) as u64;
    let mut line_num: u64 = 0;
    let mut rng = rand::thread_rng();

    // Install signal handler for clean shutdown
    let running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let r = running.clone();
    ctrlc_handler(r);

    while start.elapsed() < args.duration && running.load(std::sync::atomic::Ordering::Relaxed) {
        line_num += 1;
        let elapsed = start.elapsed();
        let msg = format!(
            "[{:.1}s] {} (line {}/{})",
            elapsed.as_secs_f64(),
            args.message,
            line_num,
            total_lines
        );

        if args.stderr_ratio > 0.0 && rng.gen::<f64>() < args.stderr_ratio {
            eprintln!("{}", msg);
            std::io::stderr().flush().ok();
        } else {
            println!("{}", msg);
            std::io::stdout().flush().ok();
        }

        tokio::time::sleep(args.interval).await;
    }

    if !running.load(std::sync::atomic::Ordering::Relaxed) {
        eprintln!("Interrupted after {} lines", line_num);
        std::process::exit(130); // Standard SIGINT exit code
    }

    std::process::exit(args.exit_code);
}

fn ctrlc_handler(running: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    let _ = ctrlc::set_handler(move || {
        running.store(false, std::sync::atomic::Ordering::Relaxed);
    });
}

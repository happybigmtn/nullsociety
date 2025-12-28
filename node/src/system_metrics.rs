use commonware_runtime::{Clock, Handle, Metrics, Spawner};
use prometheus_client::metrics::gauge::Gauge;
use std::sync::atomic::{AtomicI64, AtomicU64};
use std::time::Duration;
use sysinfo::{Pid, ProcessesToUpdate, System};

const UPDATE_INTERVAL: Duration = Duration::from_secs(5);

pub fn spawn_process_metrics<E>(context: E) -> Handle<()>
where
    E: Clock + Metrics + Spawner + Clone + Send + Sync + 'static,
{
    let metrics_context = context.with_label("system");
    // Use i64 since prometheus-client doesn't implement EncodeGaugeValue for u64
    // For f64 gauges, use AtomicU64 (prometheus-client stores f64 as bits in u64)
    let rss_bytes: Gauge<i64, AtomicI64> = Gauge::default();
    let virtual_bytes: Gauge<i64, AtomicI64> = Gauge::default();
    let cpu_percent: Gauge<f64, AtomicU64> = Gauge::default();

    metrics_context.register(
        "process_rss_bytes",
        "Resident set size in bytes.",
        rss_bytes.clone(),
    );
    metrics_context.register(
        "process_virtual_bytes",
        "Virtual memory size in bytes.",
        virtual_bytes.clone(),
    );
    metrics_context.register(
        "process_cpu_percent",
        "Process CPU usage percentage.",
        cpu_percent.clone(),
    );

    metrics_context.spawn(move |context| async move {
        let pid = Pid::from_u32(std::process::id());
        let mut system = System::new();

        let mut update = || {
            system.refresh_cpu_all();
            // sysinfo 0.30+ uses refresh_processes with a filter
            system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
            if let Some(process) = system.process(pid) {
                // sysinfo 0.30+ returns memory in bytes directly
                rss_bytes.set(process.memory() as i64);
                virtual_bytes.set(process.virtual_memory() as i64);
                cpu_percent.set(process.cpu_usage() as f64);
            } else {
                rss_bytes.set(0);
                virtual_bytes.set(0);
                cpu_percent.set(0.0);
            }
        };

        update();
        loop {
            context.sleep(UPDATE_INTERVAL).await;
            update();
        }
    })
}

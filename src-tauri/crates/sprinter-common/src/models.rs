use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CommandStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Killed,
}

impl CommandStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Killed => "killed",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "running" => Some(Self::Running),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "killed" => Some(Self::Killed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRecord {
    pub id: String,
    pub spec_json: String,
    pub status: CommandStatus,
    pub pid: Option<i64>,
    pub exit_code: Option<i32>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputChunkRecord {
    pub id: i64,
    pub command_id: String,
    pub stream: String,
    pub data: Vec<u8>,
    pub sequence: u64,
    pub timestamp: String,
}

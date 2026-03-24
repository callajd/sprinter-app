use rusqlite::{params, Connection, Result as SqliteResult};
use std::path::Path;

use crate::models::{CommandRecord, CommandStatus, OutputChunkRecord};

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> SqliteResult<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> SqliteResult<()> {
        self.conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS commands (
                id              TEXT PRIMARY KEY,
                spec_json       TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'killed')),
                pid             INTEGER,
                exit_code       INTEGER,
                created_at      TEXT NOT NULL,
                started_at      TEXT,
                completed_at    TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
            CREATE INDEX IF NOT EXISTS idx_commands_created ON commands(created_at DESC);

            CREATE TABLE IF NOT EXISTS output_chunks (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                command_id      TEXT NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
                stream          TEXT NOT NULL CHECK (stream IN ('stdout', 'stderr')),
                data            BLOB NOT NULL,
                sequence        INTEGER NOT NULL,
                timestamp       TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_command ON output_chunks(command_id, sequence);
            ",
        )
    }

    pub fn insert_command(&self, record: &CommandRecord) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT INTO commands (id, spec_json, status, pid, exit_code, created_at, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                record.id,
                record.spec_json,
                record.status.as_str(),
                record.pid,
                record.exit_code,
                record.created_at,
                record.started_at,
                record.completed_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_command_status(
        &self,
        id: &str,
        status: &CommandStatus,
        exit_code: Option<i32>,
        completed_at: Option<&str>,
    ) -> SqliteResult<()> {
        self.conn.execute(
            "UPDATE commands SET status = ?1, exit_code = ?2, completed_at = ?3 WHERE id = ?4",
            params![status.as_str(), exit_code, completed_at, id],
        )?;
        Ok(())
    }

    pub fn update_command_started(
        &self,
        id: &str,
        pid: Option<i64>,
        started_at: &str,
    ) -> SqliteResult<()> {
        self.conn.execute(
            "UPDATE commands SET status = 'running', pid = ?1, started_at = ?2 WHERE id = ?3",
            params![pid, started_at, id],
        )?;
        Ok(())
    }

    pub fn insert_output_chunks(&self, chunks: &[OutputChunkRecord]) -> SqliteResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO output_chunks (command_id, stream, data, sequence, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for chunk in chunks {
                stmt.execute(params![
                    chunk.command_id,
                    chunk.stream,
                    chunk.data,
                    chunk.sequence,
                    chunk.timestamp,
                ])?;
            }
        }
        tx.commit()
    }

    pub fn get_command(&self, id: &str) -> SqliteResult<Option<CommandRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, spec_json, status, pid, exit_code, created_at, started_at, completed_at
             FROM commands WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(CommandRecord {
                id: row.get(0)?,
                spec_json: row.get(1)?,
                status: CommandStatus::from_str(&row.get::<_, String>(2)?)
                    .unwrap_or(CommandStatus::Failed),
                pid: row.get(3)?,
                exit_code: row.get(4)?,
                created_at: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
            })
        })?;
        match rows.next() {
            Some(Ok(record)) => Ok(Some(record)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_commands(
        &self,
        status_filter: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> SqliteResult<(Vec<CommandRecord>, u32)> {
        let (where_clause, count_params, query_params): (String, Vec<Box<dyn rusqlite::types::ToSql>>, Vec<Box<dyn rusqlite::types::ToSql>>) =
            if let Some(status) = status_filter {
                (
                    "WHERE status = ?1".to_string(),
                    vec![Box::new(status.to_string()) as Box<dyn rusqlite::types::ToSql>],
                    vec![
                        Box::new(status.to_string()) as Box<dyn rusqlite::types::ToSql>,
                        Box::new(limit),
                        Box::new(offset),
                    ],
                )
            } else {
                (
                    String::new(),
                    vec![],
                    vec![
                        Box::new(limit) as Box<dyn rusqlite::types::ToSql>,
                        Box::new(offset),
                    ],
                )
            };

        let total: u32 = self.conn.query_row(
            &format!("SELECT COUNT(*) FROM commands {}", where_clause),
            rusqlite::params_from_iter(&count_params),
            |row| row.get(0),
        )?;

        let query = if status_filter.is_some() {
            format!(
                "SELECT id, spec_json, status, pid, exit_code, created_at, started_at, completed_at
                 FROM commands {} ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
                where_clause
            )
        } else {
            "SELECT id, spec_json, status, pid, exit_code, created_at, started_at, completed_at
             FROM commands ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
                .to_string()
        };

        let mut stmt = self.conn.prepare(&query)?;
        let records = stmt
            .query_map(rusqlite::params_from_iter(&query_params), |row| {
                Ok(CommandRecord {
                    id: row.get(0)?,
                    spec_json: row.get(1)?,
                    status: CommandStatus::from_str(&row.get::<_, String>(2)?)
                        .unwrap_or(CommandStatus::Failed),
                    pid: row.get(3)?,
                    exit_code: row.get(4)?,
                    created_at: row.get(5)?,
                    started_at: row.get(6)?,
                    completed_at: row.get(7)?,
                })
            })?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok((records, total))
    }

    pub fn get_output_chunks(
        &self,
        command_id: &str,
        from_sequence: u64,
    ) -> SqliteResult<Vec<OutputChunkRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, command_id, stream, data, sequence, timestamp
             FROM output_chunks
             WHERE command_id = ?1 AND sequence >= ?2
             ORDER BY sequence ASC",
        )?;
        let records = stmt
            .query_map(params![command_id, from_sequence], |row| {
                Ok(OutputChunkRecord {
                    id: row.get(0)?,
                    command_id: row.get(1)?,
                    stream: row.get(2)?,
                    data: row.get(3)?,
                    sequence: row.get(4)?,
                    timestamp: row.get(5)?,
                })
            })?
            .collect::<SqliteResult<Vec<_>>>()?;
        Ok(records)
    }
}

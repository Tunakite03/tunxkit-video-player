use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    /// The path was never handed out by a media command, so the webview may not use it.
    #[error("access not granted: {0}")]
    NotGranted(String),
    #[error("file too large: {path} is over {limit} bytes")]
    FileTooLarge { path: String, limit: u64 },
    /// A newer request for the same work started, so this one stopped early.
    #[error("superseded by a newer request")]
    Superseded,
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

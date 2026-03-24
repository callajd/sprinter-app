pub mod command {
    pub mod v1 {
        tonic::include_proto!("sprinter.command.v1");
    }
}

pub use command::v1::*;

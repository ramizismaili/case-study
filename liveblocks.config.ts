declare global {
  interface Liveblocks {
    // Custom user info set when authenticating with a secret key
    UserMeta: {
      id: string; // Accessible through `user.id`
      info: {
        name: string;
        avatar: string;
      }; // Accessible through `user.info`
    };
    // Custom metadata set on threads, for useThreads, useCreateThread, etc.
    ThreadMetadata: {
      // Starter viewport pixels. Image-relative persistence is added in milestone 2.
      x: number;
      y: number;
      zIndex: number;
    };
  }
}

export {};

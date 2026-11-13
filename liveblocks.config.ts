declare global {
  interface Liveblocks {
    Presence: {
      // Ephemeral normalized image coordinates, independent of each local view.
      cursor: { x: number; y: number } | null;
    };
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
      // "image" stores normalized x/y. Absent on legacy viewport-pixel threads.
      coordinateSpace?: "image";
      x: number;
      y: number;
      zIndex: number;
    };
  }
}

export {};

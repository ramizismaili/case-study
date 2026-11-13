import { ImageCanvas } from "../components/ImageCanvas";
import { Room } from "./Room";

// Read server configuration at request time, including when using npm start.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ImageCanvas>
      <Room isConfigured={Boolean(process.env.LIVEBLOCKS_SECRET_KEY)} />
    </ImageCanvas>
  );
}

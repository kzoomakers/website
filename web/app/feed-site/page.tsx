import Listing from "@/feed/views/listing";

export const dynamic = "force-dynamic";

export default function FeedHome() {
  return <Listing kind="hottest" page={1} />;
}

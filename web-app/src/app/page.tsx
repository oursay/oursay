import { redirect } from "next/navigation";

// The civic app lives under the (app) route group; the unified feed is home.
export default function RootPage() {
  redirect("/feed");
}

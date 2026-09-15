import { EmbedClient } from "./EmbedClient";

export default function EmbedPage({ params }: { params: { component: string } }) {
  return <EmbedClient slug={params.component} />;
}

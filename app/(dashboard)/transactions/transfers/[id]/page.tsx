import { TransferDetailPage } from "../../_components/transfer-detail-page";

export default async function TransferDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TransferDetailPage transferId={id} />;
}

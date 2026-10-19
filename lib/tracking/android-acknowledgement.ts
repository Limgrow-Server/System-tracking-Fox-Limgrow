type AcknowledgementTransaction = {
  acknowledged: boolean;
  acknowledgementSource?: string | null;
  acknowledgedAt?: string | null;
};

export function androidAcknowledgementMeta(tx: AcknowledgementTransaction) {
  if (!tx.acknowledged) {
    return {
      label: "Chưa xác nhận",
      source: null,
      confirmed: false,
      title:
        "Chưa ghi nhận acknowledge. Đây là trạng thái lưu trong DB, không phải truy vấn Google trực tiếp.",
    };
  }
  const source =
    tx.acknowledgementSource === "server"
      ? "Server"
      : tx.acknowledgementSource === "app"
        ? "App"
        : "Không rõ nguồn";
  return {
    label: "Đã xác nhận",
    source,
    confirmed: true,
    title:
      source === "Server"
        ? "Có bằng chứng server đã gửi acknowledge và Google trả thành công; không xác định ai xác nhận đầu tiên khi có gọi đồng thời."
        : source === "App"
          ? "Nguồn acknowledge được ghi nhận là app."
          : "Google báo đã acknowledge nhưng không cho biết app hay server khác gửi. Dữ liệu cũ không được tự suy đoán nguồn.",
  };
}

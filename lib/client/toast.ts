type ToastType = "error" | "info" | "success" | "warning";

export async function showToast(type: ToastType, message: string) {
  const { toast } = await import("sonner");
  toast[type](message);
}

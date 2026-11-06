import { useCallback, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";

// Confirmación con la ventana de la app, usable con await:
//   const [confirm, confirmModal] = useConfirm();
//   if (!(await confirm({ title: "…", message: "…" }))) return;
//   …y en el JSX: {confirmModal}
export default function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);

  const confirmModal = request && (
    <ConfirmModal {...request} onResult={(ok) => { request.resolve(ok); setRequest(null); }} />
  );

  return [confirm, confirmModal];
}

import { useEffect, useRef } from "react";

export default function useModalDialog() {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return dialogRef;
}

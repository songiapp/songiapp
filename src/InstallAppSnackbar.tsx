import { Button, IconButton, Snackbar } from "@mui/material";
import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { useIntl } from "react-intl";

export default function InstallAppSnackbar() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installClicked, setInstallClicked] = useState(false);
  const intl = useIntl();

  useEffect(() => {
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    ) {
      // is mobile..

      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
      });
    }
  }, []);

  return (
    <Snackbar
      open={!!deferredPrompt && !installClicked}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      message={intl.formatMessage({
        id: "app-is-offline",
        defaultMessage:
          "SongiApp is prepared for offline usage, you can install it as normal app",
      })}
      onClose={() => setDeferredPrompt(null)}
      action={
        <>
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              deferredPrompt.prompt();
              setInstallClicked(true);
              setDeferredPrompt(null);
            }}
          >
            Install
          </Button>
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={() => setDeferredPrompt(null)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
    />
  );
}

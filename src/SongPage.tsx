import { useQuery } from "@tanstack/react-query";
import PageLayout from "./PageLayout";
import { addRecentSong, getDatabase, getSong } from "./localdb";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Grid,
  Typography,
  useTheme,
} from "@mui/material";
import { LocalDatabase, LocalSong } from "./types";
import { Link, useParams } from "react-router-dom";
import SongFormatter from "./SongFormatter";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBaseTone, transposeText } from "./chordTools";
import _ from "lodash";
import { FormattedMessage, useIntl } from "react-intl";
import { parseSongParts } from "./songpro";
import MaterialLink from "@mui/material/Link";

export interface LayoutOptions {
  columns: number;
  fontSize: number;
  view: "normal" | "source";
}

function divideText(text: string, columns: number): string[] {
  if (columns == 1) {
    return [text];
  }
  const lines = text.split("\n");

  return _.range(0, columns).map((index) =>
    lines
      .slice(
        Math.round((lines.length / columns) * index),
        index == columns - 1
          ? undefined
          : Math.round((lines.length / columns) * (index + 1))
      )
      .join("\n")
  );
}

export default function SongPage() {
  const { dbid, artistid, songid } = useParams();
  const intl = useIntl();

  const songFullId = `${dbid}/${artistid}/${songid}`;

  const wakeLockRef = useRef<any>(null);

  const [layout, setLayout] = useState<LayoutOptions>({
    columns: 1,
    fontSize: 16,
    view: "normal",
  });

  const query = useQuery<LocalSong | undefined>({
    queryKey: ["song", songFullId],
    queryFn: () => getSong(songFullId!),
    networkMode: "always",
  });

  const { text } = useMemo(
    () => parseSongParts(query?.data?.source ?? ""),
    [query?.data]
  );

  const [transpDiff, setTranspDiff] = useState(0);
  const transposedText = useMemo(
    () => (transpDiff ? transposeText(text ?? "", transpDiff) : text),
    [text, transpDiff]
  );
  const textColumns = useMemo(
    () => divideText(transposedText ?? "", layout.columns),
    [transposedText, layout.columns]
  );

  const dbQuery = useQuery<LocalDatabase | undefined>({
    queryKey: ["selected-database", dbid],
    queryFn: () => getDatabase(dbid ?? ""),
    networkMode: "always",
  });

  useEffect(() => {
    if (query.data) {
      addRecentSong(query.data);
    }
  }, [query.data]);

  useEffect(() => {
    if ("wakeLock" in navigator) {
      const navigatorWakeLock = navigator.wakeLock as any;
      navigatorWakeLock
        .request("screen")
        .then((lock) => (wakeLockRef.current = lock));
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
    };
  }, []);

  const theme = useTheme();

  return (
    <PageLayout
      title={query.data?.title ?? "Loading..."}
      showBack
      rightDrawerContent={
        <>
          <Typography variant="h5" sx={{ m: 2 }}>
            <FormattedMessage id="transpose" defaultMessage="Tranpose" />
          </Typography>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={() => setTranspDiff(0)}
            >
              <FormattedMessage id="reset" defaultMessage="Reset" />
            </Button>
          </Box>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={() => setTranspDiff((x) => x - 1)}
            >
              -1
            </Button>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={() => setTranspDiff((x) => x + 1)}
            >
              +1
            </Button>
          </Box>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={() => setTranspDiff((x) => x - 2)}
            >
              -2
            </Button>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={() => setTranspDiff((x) => x + 2)}
            >
              +2
            </Button>
          </Box>
          <Typography variant="h5" sx={{ m: 2 }}>
            <FormattedMessage id="columns" defaultMessage="Columns" />
          </Typography>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              disabled={layout.columns <= 1}
              onClick={(e) =>
                setLayout({ ...layout, columns: layout.columns - 1 })
              }
            >
              -1
            </Button>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={(e) =>
                setLayout({ ...layout, columns: layout.columns + 1 })
              }
            >
              +1
            </Button>
          </Box>
          <Typography variant="h5" sx={{ m: 2 }}>
            <FormattedMessage id="font-size" defaultMessage="Font size" />
          </Typography>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={(e) =>
                setLayout({ ...layout, fontSize: layout.fontSize - 1 })
              }
            >
              -1
            </Button>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={(e) =>
                setLayout({ ...layout, fontSize: layout.fontSize + 1 })
              }
            >
              +1
            </Button>
          </Box>
          <Typography variant="h5" sx={{ m: 2 }}>
            <FormattedMessage id="view" defaultMessage="View" />
          </Typography>
          <Box>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={(e) => setLayout({ ...layout, view: "normal" })}
            >
              <FormattedMessage id="normal" defaultMessage="Normal" />
            </Button>
            <Button
              variant="contained"
              size="small"
              sx={{ m: 1 }}
              onClick={(e) => setLayout({ ...layout, view: "source" })}
            >
              <FormattedMessage id="source" defaultMessage="Source" />
            </Button>
          </Box>
          <Typography variant="h5" sx={{ m: 2 }}>
            <FormattedMessage id="add-to-database" defaultMessage="Add to database" />
          </Typography>
        </>
      }
    >
      {query.isPending ? (
        <CircularProgress />
      ) : query.error ? (
        <Alert severity="error">{query.error.message}</Alert>
      ) : layout.view == "normal" ? (
        <>
          <Typography sx={{ m: 1 }}>
            <Typography sx={{ fontWeight: "bold" }} component="span">
              <FormattedMessage id="artist" defaultMessage="Artist" />:
            </Typography>
            <MaterialLink
              sx={{ ml: 1 }}
              component={Link}
              to={`/by-artist/${dbid}/${artistid}`}
            >
              {query?.data?.artist}
            </MaterialLink>
          </Typography>
          <Typography sx={{ m: 1 }}>
            <Typography sx={{ fontWeight: "bold" }} component="span">
              <FormattedMessage id="database" defaultMessage="Database" />:
            </Typography>
            <MaterialLink
              sx={{ ml: 1 }}
              component={Link}
              to={`/databases/${dbid}`}
            >
              {dbQuery?.data?.title ?? dbid}
            </MaterialLink>
          </Typography>
          <Grid container>
            {textColumns.map((textColumn, index) => (
              <Grid item xs={12 / layout.columns} key={index}>
                <Typography sx={{ m: 1, fontSize: layout.fontSize }}>
                  {new SongFormatter(
                    textColumn,
                    theme.palette.primary.main
                  ).format()}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <Typography
          sx={{ m: 1, fontSize: layout.fontSize, overflowX: "scroll" }}
        >
          <pre>{query?.data?.source}</pre>
        </Typography>
      )}
    </PageLayout>
  );
}

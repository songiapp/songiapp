import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

import { createHashRouter, RouterProvider } from "react-router-dom";
import ErrorPage from "./ErrorPage";
import DownloadPage from "./DownloadPage";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import ArtistListPage from "./ArtistListPage";
import ByArtistListPage from "./ByArtistListPage";
import SongPage from "./SongPage";

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    path: "/",
    element: <ArtistListPage />,
  },
  {
    path: "/download",
    element: <DownloadPage />,
  },
  {
    path: "/by-artist/:artist",
    element: <ByArtistListPage />,
  },
  {
    path: "/songs/:songid",
    element: <SongPage />,
  },
  {
    path: "*",
    element: <ErrorPage />,
  },
]);

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

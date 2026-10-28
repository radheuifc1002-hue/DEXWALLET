import { createBrowserRouter } from "react-router";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { SetPin } from "./screens/SetPin";
import { GenerateSeedPhrase } from "./screens/GenerateSeedPhrase";
import { ConfirmSeedPhrase } from "./screens/ConfirmSeedPhrase";
import { ImportWallet } from "./screens/ImportWallet";
import { Home } from "./screens/Home";
import { TokenDetails } from "./screens/TokenDetails";
import { ImportToken } from "./screens/ImportToken";
import { Send } from "./screens/Send";
import { Receive } from "./screens/Receive";
import { Browser } from "./screens/Browser";
import { DAppView } from "./screens/DAppView";
import { Settings } from "./screens/Settings";
import { ExportSeedPhrase } from "./screens/ExportSeedPhrase";
import { ChangePin } from "./screens/ChangePin";
import { PinLock } from "./screens/PinLock";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Splash,
  },
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/set-pin",
    Component: SetPin,
  },
  {
    path: "/generate-seed",
    Component: GenerateSeedPhrase,
  },
  {
    path: "/confirm-seed",
    Component: ConfirmSeedPhrase,
  },
  {
    path: "/import-wallet",
    Component: ImportWallet,
  },
  {
    path: "/pin-lock",
    Component: PinLock,
  },
  {
    path: "/home",
    Component: Home,
  },
  {
    path: "/token/:id",
    Component: TokenDetails,
  },
  {
    path: "/import-token",
    Component: ImportToken,
  },
  {
    path: "/send",
    Component: Send,
  },
  {
    path: "/receive",
    Component: Receive,
  },
  {
    path: "/browser",
    Component: Browser,
  },
  {
    path: "/dapp/:url",
    Component: DAppView,
  },
  {
    path: "/settings",
    Component: Settings,
  },
  {
    path: "/export-seed",
    Component: ExportSeedPhrase,
  },
  {
    path: "/change-pin",
    Component: ChangePin,
  },
]);

import createDebugger from "debug"
import lodash from "lodash"
import { getContext, put } from "redux-saga/effects"
import sh from "shelljs"
import { Settings, SETTINGS } from "../../services"
import { createErrorLogger } from "../../util/error-logger"
import { setTransitioning, updateHomeAssistant } from "../action-creators"
import type { ChangePowerModeAction } from "../types"

const debug = createDebugger("@ha:ps5:turnOffDevice")
const debugError = createErrorLogger()

function* turnOffDevice(action: ChangePowerModeAction) {
  const { credentialStoragePath, allowPs4Devices }: Settings =
    yield getContext(SETTINGS)

  if (action.payload.mode !== "STANDBY") {
    return
  }

  yield put(
    setTransitioning(
      lodash.merge({}, action.payload.device, { transitioning: true }),
    ),
  )
  try {
    // Standby requires a full Remote Play handshake (discovery, session
    // init, login, passcode, then the standby request itself), which can
    // take much longer than a simple wake. The shelljs timeout must safely
    // exceed the sum of the discovery/connect timeouts below so a slow but
    // healthy handshake isn't killed mid-flight.
    const { code, stdout, stderr } = sh.exec(
      `playactor standby --ip ${action.payload.device.address.address}` +
        ` --timeout 10000 --connect-timeout 10000${
          allowPs4Devices ? "" : " --ps5"
        } --no-open-urls --no-auth -c ${credentialStoragePath}`,
      { silent: true, timeout: 25000 },
    )

    // playactor's `standby` command exits 0 on success and non-zero on any
    // failure (including a shelljs timeout-kill, which produces exit code 1
    // with no stderr output). Checking stderr alone misses that case, so the
    // exit code - the same signal check-devices-state.ts trusts - is used
    // as the authoritative success/failure indicator here.
    if (code !== 0) {
      throw new Error(
        stderr ||
          `playactor standby exited with code ${code} without completing ` +
            "the standby handshake (it may have been killed after " +
            "exceeding the timeout)",
      )
    }
    debug(stdout)

    yield put(
      updateHomeAssistant({
        ...action.payload.device,
        status: "STANDBY",
        activity: undefined, // also clear the activity when a device turns off
      }),
    )
  } catch (e) {
    debugError(e)
  }
}

export { turnOffDevice }

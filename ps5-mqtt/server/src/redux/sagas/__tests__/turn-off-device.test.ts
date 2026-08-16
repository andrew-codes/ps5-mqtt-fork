import { runSaga } from "redux-saga"
import sh from "shelljs"

import { SETTINGS, Settings } from "../../../services"
import { Device } from "../../types"
import { turnOffDevice } from "../turn-off-device"

jest.mock("shelljs")

jest.mock("../../action-creators", () => {
  const originalModule = jest.requireActual("../../action-creators")

  return {
    __esModule: true,
    ...originalModule,
    updateHomeAssistant: jest.fn((device) => ({
      type: "UPDATE_HOME_ASSISTANT",
      payload: device,
    })),
  }
})

const mockExec = jest.mocked(sh.exec)

const mockExecResult = (result: {
  code: number
  stdout: string
  stderr: string
}) => {
  mockExec.mockReturnValue(result as unknown as ReturnType<typeof sh.exec>)
}

const mockDevice: Device = {
  address: { address: "192.168.0.10", port: 80 },
  available: true,
  id: "mock-id-1",
  name: "mock-ps5-1",
  normalizedName: "mock_ps5_1",
  status: "AWAKE",
  systemVersion: "",
  transitioning: false,
  type: "PS5",
  activity: undefined,
}

const mockSettings: Settings = {
  checkDevicesInterval: 0,
  discoverDevicesInterval: 0,
  checkAccountInterval: 0,
  credentialStoragePath: "/tmp/credentials",
  allowPs4Devices: true,
  deviceDiscoveryBroadcastAddress: "255.255.255.255",
  discoveryTopic: "topic",
}

describe("Turn Off Device saga", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test("reports STANDBY to Home Assistant when the standby command completes successfully", async () => {
    mockExecResult({ code: 0, stdout: "", stderr: "" })

    await runSaga(
      {
        dispatch: () => {},
        getState: () => ({}),
        context: { [SETTINGS]: mockSettings },
      },
      turnOffDevice,
      {
        type: "CHANGE_POWER_MODE",
        payload: { device: mockDevice, mode: "STANDBY" },
      },
    ).toPromise()

    const mockedUpdateHa = jest.requireMock(
      "../../action-creators",
    ).updateHomeAssistant

    expect(mockedUpdateHa).toHaveBeenCalledWith({
      ...mockDevice,
      status: "STANDBY",
      activity: undefined,
    })
  })

  // https://github.com/FunkeyFlo/ps5-mqtt/issues/675
  // A standby request killed by the shelljs process timeout (a full Remote
  // Play handshake can outlast a short timeout) exits with code 1 and empty
  // stdout/stderr - nothing throws, so the old `if (stderr) throw stderr`
  // guard never fired and the saga optimistically reported STANDBY even
  // though the console never actually went to standby.
  test("does not report STANDBY to Home Assistant when the command is killed by the shelljs timeout", async () => {
    mockExecResult({ code: 1, stdout: "", stderr: "" })

    await runSaga(
      {
        dispatch: () => {},
        getState: () => ({}),
        context: { [SETTINGS]: mockSettings },
      },
      turnOffDevice,
      {
        type: "CHANGE_POWER_MODE",
        payload: { device: mockDevice, mode: "STANDBY" },
      },
    ).toPromise()

    const mockedUpdateHa = jest.requireMock(
      "../../action-creators",
    ).updateHomeAssistant

    expect(mockedUpdateHa).not.toHaveBeenCalled()
  })

  test("does not report STANDBY to Home Assistant when the command fails with stderr output", async () => {
    mockExecResult({
      code: 2,
      stdout: "",
      stderr: "device not found",
    })

    await runSaga(
      {
        dispatch: () => {},
        getState: () => ({}),
        context: { [SETTINGS]: mockSettings },
      },
      turnOffDevice,
      {
        type: "CHANGE_POWER_MODE",
        payload: { device: mockDevice, mode: "STANDBY" },
      },
    ).toPromise()

    const mockedUpdateHa = jest.requireMock(
      "../../action-creators",
    ).updateHomeAssistant

    expect(mockedUpdateHa).not.toHaveBeenCalled()
  })

  test("passes --ps5 to playactor when PS4 devices are not allowed", async () => {
    mockExecResult({ code: 0, stdout: "", stderr: "" })

    await runSaga(
      {
        dispatch: () => {},
        getState: () => ({}),
        context: { [SETTINGS]: { ...mockSettings, allowPs4Devices: false } },
      },
      turnOffDevice,
      {
        type: "CHANGE_POWER_MODE",
        payload: { device: mockDevice, mode: "STANDBY" },
      },
    ).toPromise()

    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("--ps5"),
      expect.anything(),
    )
  })

  test("does not pass --ps5 to playactor when PS4 devices are allowed", async () => {
    mockExecResult({ code: 0, stdout: "", stderr: "" })

    await runSaga(
      {
        dispatch: () => {},
        getState: () => ({}),
        context: { [SETTINGS]: mockSettings },
      },
      turnOffDevice,
      {
        type: "CHANGE_POWER_MODE",
        payload: { device: mockDevice, mode: "STANDBY" },
      },
    ).toPromise()

    expect(mockExec).toHaveBeenCalledWith(
      expect.not.stringContaining("--ps5"),
      expect.anything(),
    )
  })
})

import { deriveItHardwareMeasurements } from './it-hardware-measurements.util';

describe('IT hardware measurements (it-hardware)', () => {
  it('aggregates split repair and recovery counts and sets conditional OS licensing', () => {
    const resultWindows = deriveItHardwareMeasurements(
      null,
      {
        deviceCount: 2,
        simpleRepairCount: 3,
        mediumRepairCount: 1,
        complexRepairCount: 0,
        osInstallCount: 2,
        osType: 'Windows 10/11',
        logicRecoveryCount: 1,
        physicalRecoveryCount: 0,
        severeRecoveryCount: 2,
      },
      {},
    );

    expect(resultWindows.deviceCount).toBe(2);
    expect(resultWindows.repairCount).toBe(4);
    expect(resultWindows.simpleRepairCount).toBe(3);
    expect(resultWindows.mediumRepairCount).toBe(1);
    expect(resultWindows.complexRepairCount).toBe(0);
    expect(resultWindows.osLicenseCount).toBe(2); 
    expect(resultWindows.dataRecoveryCount).toBe(3);
    expect(resultWindows.logicRecoveryCount).toBe(1);
    expect(resultWindows.severeRecoveryCount).toBe(2);
  });

  it('charges 0 OS licenses for Linux installations', () => {
    const resultLinux = deriveItHardwareMeasurements(
      null,
      {
        deviceCount: 1,
        osInstallCount: 3,
        osType: 'Linux (Ubuntu/Debian)',
      },
      {},
    );

    expect(resultLinux.osInstallCount).toBe(3);
    expect(resultLinux.osLicenseCount).toBe(0); 
  });
});

import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const select = source.slice(source.indexOf('async function preferTorchPhotoCamera()'), source.indexOf('function switchPhotoCamera()'));
const cycle = source.slice(source.indexOf('function cyclePhotoCameraZoom()'), source.indexOf('function applyPhotoCameraZoom('));

for (const supported of [true, false]) {
  test(`camera selection restores original when no torch: ${!supported}`, async () => {
    const visited = [];
    const context = vm.createContext({
      cameraSelecting: false, cameraRestarting: false, cameraDeviceIndex: 0,
      cameraDevices: [{ label: 'Rear wide' }, { label: 'Front' }, { label: 'Rear main' }],
      photoCameraStream: { getVideoTracks: () => [{ getSettings: () => ({ facingMode: 'environment' }), getCapabilities: () => ({ torch: false }) }] },
      $: () => ({ open: true }),
    });
    context.restartPhotoCameraStream = async () => {
      visited.push(context.cameraDeviceIndex);
      context.photoCameraStream = { getVideoTracks: () => [{ getSettings: () => ({ facingMode: 'environment' }), getCapabilities: () => ({ torch: supported && context.cameraDeviceIndex === 2 }) }] };
      return true;
    };
    vm.runInContext(select, context);
    await vm.runInContext('preferTorchPhotoCamera()', context);
    assert.deepEqual(visited, supported ? [2] : [2, 0]);
    assert.equal(context.cameraDeviceIndex, supported ? 2 : 0);
    assert.equal(context.cameraSelecting, false);
  });
}

test('zoom cycles supported levels and wraps', () => {
  const context = vm.createContext({ cameraRestarting: false, cameraSelecting: false, cameraZoomLevels: [1, 3], cameraZoomLevel: 1 });
  const applied = [];
  context.applyPhotoCameraZoom = (level) => { applied.push(level); context.cameraZoomLevel = level; };
  vm.runInContext(cycle, context);
  vm.runInContext('cyclePhotoCameraZoom(); cyclePhotoCameraZoom()', context);
  assert.deepEqual(applied, [3, 1]);
  context.cameraSelecting = true;
  vm.runInContext('cyclePhotoCameraZoom()', context);
  assert.equal(applied.length, 2);
});

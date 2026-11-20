import { URL } from 'node:url';
import { setImmediate } from 'node:timers';
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

const torchFunctions = source.slice(source.indexOf('function cameraTorchMode('), source.indexOf('// The "3:4"'));

function torchHarness() {
  const classes = new Set();
  const button = { classList: {
    toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    remove(name) { classes.delete(name); },
  } };
  const calls = [];
  const toasts = [];
  const context = vm.createContext({
    cameraTorchOn: false, photoCameraStream: null,
    $: () => button, showToast: (message) => toasts.push(message), t: (key) => key,
    console: { warn() {} },
  });
  vm.runInContext(torchFunctions, context);
  const track = (caps) => ({
    getCapabilities: () => caps,
    getSettings: () => ({ facingMode: 'environment', torch: context.cameraTorchOn }),
    applyConstraints: async (constraints) => { calls.push(constraints); },
  });
  const activate = (active) => {
    context.photoCameraStream = { getVideoTracks: () => [active] };
    context.setupPhotoCameraTorch(active);
  };
  return { context, classes, calls, toasts, track, activate };
}

for (const caps of [{}, { torch: false }]) {
  test(`unsupported torch hidden without constraint or toast: ${JSON.stringify(caps)}`, () => {
    const h = torchHarness();
    h.activate(h.track(caps));
    h.context.togglePhotoCameraTorch();
    assert.ok(h.classes.has('hidden'));
    assert.equal(h.calls.length, 0);
    assert.equal(h.toasts.length, 0);
  });
}

test('torch control follows active camera capability and clears old state', () => {
  const h = torchHarness();
  h.activate(h.track({ torch: true }));
  assert.equal(h.classes.has('hidden'), false);
  h.context.cameraTorchOn = true;
  h.activate(h.track({ torch: false }));
  assert.ok(h.classes.has('hidden'));
  assert.equal(h.context.cameraTorchOn, false);
  assert.equal(h.classes.has('active'), false);
  h.activate(h.track({ torch: true }));
  assert.equal(h.classes.has('hidden'), false);
});

test('reported-supported torch failures still show feedback', async () => {
  const h = torchHarness();
  h.activate(h.track({ torch: true }));
  h.context.togglePhotoCameraTorch();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.toasts, ['photoScan.torchFailed']);
});

import { expect, test } from 'vitest';
import {
  describeWait,
  plannedStages,
  stageProducing,
  stagesEnded,
  stagesInProgress,
  type Stage,
} from './stages';

const source = 'public fun main() {}';
const ALL: Stage[] = ['front-end', 'back-end', 'run'];

test('plannedStages follows what the request asks for', () => {
  expect(plannedStages({ source })).toEqual(ALL);
  expect(plannedStages({ source, emit: ['ir'] })).toEqual(['front-end']);
  expect(plannedStages({ source, emit: ['ir', 'llvm'] })).toEqual(['front-end', 'back-end']);
  expect(plannedStages({ source, emit: ['ir', 'executable'], stopAfter: 'lowering' })).toEqual([
    'front-end',
  ]);
});

test('stagesInProgress runs the stage after the last done, once begun', () => {
  expect(stagesInProgress(ALL, null, false)).toEqual({
    'front-end': 'waiting',
    'back-end': 'waiting',
    run: 'waiting',
  });
  expect(stagesInProgress(ALL, null, true)).toEqual({
    'front-end': 'running',
    'back-end': 'waiting',
    run: 'waiting',
  });
  expect(stagesInProgress(ALL, 'back-end', true)).toEqual({
    'front-end': 'done',
    'back-end': 'done',
    run: 'running',
  });
  expect(stagesInProgress(['front-end'], null, true)).toEqual({
    'front-end': 'running',
    'back-end': 'off',
    run: 'off',
  });
});

test('stagesEnded fails the stage that did not finish, and skips the rest', () => {
  expect(stagesEnded(ALL, 'front-end', 'failed')).toEqual({
    'front-end': 'done',
    'back-end': 'failed',
    run: 'skipped',
  });
  expect(stagesEnded(ALL, 'back-end', 'failed')).toEqual({
    'front-end': 'done',
    'back-end': 'done',
    run: 'failed',
  });
  expect(stagesEnded(ALL, null, 'failed')).toEqual({
    'front-end': 'failed',
    'back-end': 'skipped',
    run: 'skipped',
  });
});

test('stagesEnded skips what follows errors, and a run that did not happen', () => {
  expect(stagesEnded(ALL, null, 'errors')).toEqual({
    'front-end': 'done',
    'back-end': 'skipped',
    run: 'skipped',
  });
  expect(stagesEnded(ALL, null, { ran: true })).toEqual({
    'front-end': 'done',
    'back-end': 'done',
    run: 'done',
  });
  expect(stagesEnded(ALL, 'front-end', { ran: false })).toEqual({
    'front-end': 'done',
    'back-end': 'done',
    run: 'skipped',
  });
});

test('stageProducing names the stage producing each view', () => {
  const all = stagesInProgress(ALL, null, true);
  expect(stageProducing('ir', all)).toBe('front-end');
  expect(stageProducing('assembly', all)).toBe('back-end');
  expect(stageProducing('diagnostics', all)).toBe('back-end');
  expect(stageProducing('result', all)).toBe('run');
  const frontEndOnly = stagesInProgress(['front-end'], null, true);
  expect(stageProducing('diagnostics', frontEndOnly)).toBe('front-end');
  expect(stageProducing('result', frontEndOnly)).toBe('front-end');
});

test('describeWait says what a stage waits for', () => {
  const frontEndRunning = stagesInProgress(ALL, null, true);
  expect(describeWait('front-end', frontEndRunning)).toBe('Front end in progress');
  expect(describeWait('run', frontEndRunning)).toBe('Waiting for the front end');
  expect(describeWait('run', stagesInProgress(ALL, null, false))).toBe('Waiting to start');
});

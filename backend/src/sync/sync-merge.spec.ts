import { isDeleted, mergeServerRecord, RecordState } from './sync-merge';

function state(over: Partial<RecordState> = {}): RecordState {
  return {
    fields: { title: 'server', description: 'server desc' },
    clocks: { title: 100, description: 100 },
    nodeId: 'server-node',
    deletedAt: null,
    ...over,
  };
}

describe('mergeServerRecord (field-level LWW)', () => {
  it('takes the client field when its clock is newer', () => {
    const server = state();
    const client = state({
      fields: { title: 'client', description: 'server desc' },
      clocks: { title: 300, description: 100 },
      nodeId: 'client-node',
    });

    const { merged, report, serverChanged, clientAccepted } = mergeServerRecord(
      server,
      client,
    );
    expect(merged.fields.title).toBe('client'); // 300 > 100
    expect(merged.clocks.title).toBe(300);
    expect(report.title).toBe('client');
    expect(serverChanged).toBe(true);
    expect(clientAccepted).toBe(true);
  });

  it('keeps the server field when its clock is newer and reports serverAhead', () => {
    const server = state({ clocks: { title: 500, description: 100 } });
    const client = state({
      fields: { title: 'client', description: 'server desc' },
      clocks: { title: 200, description: 100 },
    });

    const { merged, report, serverChanged, serverAhead } = mergeServerRecord(
      server,
      client,
    );
    expect(merged.fields.title).toBe('server'); // 500 > 200
    expect(report.title).toBe('server');
    expect(serverChanged).toBe(false); // nothing the client sent won
    expect(serverAhead).toBe(true); // client should pull the server's title
  });

  it('breaks an exact clock tie by greater value, independent of side', () => {
    const server = state({ fields: { title: 'aaa' }, clocks: { title: 500 } });
    const client = state({ fields: { title: 'zzz' }, clocks: { title: 500 } });

    const ab = mergeServerRecord(server, client).merged.fields.title;
    // Swap the roles: the winner must be the same greater value ('zzz').
    const ba = mergeServerRecord(
      state({ fields: { title: 'zzz' }, clocks: { title: 500 } }),
      state({ fields: { title: 'aaa' }, clocks: { title: 500 } }),
    ).merged.fields.title;

    expect(ab).toBe('zzz');
    expect(ba).toBe('zzz');
  });

  it('a later client delete buries the record', () => {
    const server = state({ clocks: { title: 200, description: 200 } });
    const client = state({ deletedAt: 300 });

    const { merged, clientAccepted } = mergeServerRecord(server, client);
    expect(merged.deletedAt).toBe(300);
    expect(clientAccepted).toBe(true);
    expect(isDeleted(merged)).toBe(true); // tombstone@300 > newest field@200
  });

  it('a later field edit resurrects a record deleted earlier', () => {
    const server = state({
      deletedAt: 200,
      clocks: { title: 100, description: 100 },
    });
    const client = state({
      fields: { title: 'edited', description: 'server desc' },
      clocks: { title: 300, description: 100 },
    });

    const { merged } = mergeServerRecord(server, client);
    expect(merged.deletedAt).toBe(200);
    expect(isDeleted(merged)).toBe(false); // edit@300 > tombstone@200
    expect(merged.fields.title).toBe('edited');
  });

  it('reports no change and no serverAhead when both sides already agree', () => {
    const server = state();
    const client = state({ nodeId: 'server-node' });
    const { serverChanged, clientAccepted, serverAhead } = mergeServerRecord(
      server,
      client,
    );
    expect(serverChanged).toBe(false);
    expect(clientAccepted).toBe(false);
    expect(serverAhead).toBe(false);
  });
});

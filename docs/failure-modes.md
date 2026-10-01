# Failure modes

## Snapshot is stale
The UI changed after it was observed. Response: refuse the write until a fresh snapshot exists.

## Grant expired
The action was previously allowed but the permission window ended. Response: deny.

## Target origin changed
The browser is no longer on the approved origin. Response: deny.

## Write outcome is unknown
The click/type may have happened, but readback cannot prove it. Response: mark ambiguous and stop.

## Completed effect is replayed
The same canonical request arrives again after commit. Response: treat it as already completed, not a new write.

## New action appears
The transport exposes something the grant did not include. Response: deny by default.

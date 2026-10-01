# Write-state table

| Effect state | May write? | Next move |
|---|---:|---|
| no intent recorded | yes, if grant + snapshot are valid | record intent, write once |
| intent recorded, outcome unknown | no | refresh state and verify |
| committed | no | return already-completed result |
| grant expired | no | obtain new authorization |
| snapshot stale | no | obtain fresh snapshot |
| origin changed | no | stop; new origin needs reviewed permission |

This is the core retry rule: **network uncertainty is not permission to repeat a side effect.**

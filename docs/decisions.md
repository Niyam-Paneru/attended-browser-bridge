# Decisions

## “Maybe it clicked” means stop

Automatic retry after an uncertain write is how duplicate posts, duplicate purchases, and duplicate form submissions happen.

## Grants expire

A permission that was reasonable once is not permission forever. Time is part of the authorization input.

## Snapshots have identity

A target observation carries an origin, revision, and observation time. A write should not pretend an old screen is current.

## Keep transport out of the public proof

The interesting property is the control boundary. Chrome plumbing, local grants, and machine-specific transport stay in the private project.

> Browsers are nondeterministic enough. The policy layer does not need to help.

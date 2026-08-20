import { Navigate, useOutletContext } from 'react-router-dom';
import type { DataRoomOutletContext } from './data-room-context.js';

export function WorkspaceIndexRoute(): React.JSX.Element {
  const { bootstrap } = useOutletContext<DataRoomOutletContext>();
  return <Navigate to={`/workspace/${bootstrap.room.rootNodeId}`} replace />;
}

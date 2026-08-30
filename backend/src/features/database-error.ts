import type { PostgrestError } from '@supabase/supabase-js'
import { RoomError, type RoomErrorCode } from '../rooms/errors.js'
import { FeatureError, type FeatureErrorCode } from './errors.js'

export function mapFeatureDatabaseError(error: PostgrestError): Error {
  const featureCodes: FeatureErrorCode[] = ['PROFILE_NOT_FOUND','CANNOT_FRIEND_SELF','FRIEND_REQUEST_DUPLICATE','ALREADY_FRIENDS','FRIEND_REQUEST_NOT_FOUND','FRIENDSHIP_NOT_FOUND','INVITE_NOT_FOUND','INVITE_STALE','INVITE_DUPLICATE','CHAT_LIMIT_EXCEEDED','EXPLAIN_LIMIT_EXCEEDED','EXPLAIN_STATE_CONFLICT','EXPORT_LIMIT_EXCEEDED','RATE_LIMITED','FORBIDDEN']
  const feature = featureCodes.find((code) => error.message.includes(code))
  if (feature) return new FeatureError(feature, error.message.replace(`${feature}: `, ''))
  const roomCodes: RoomErrorCode[] = ['ROOM_NOT_FOUND','ROOM_FULL','ROOM_ENDED','NOT_A_PARTICIPANT','INVALID_ROOM_STATE','INVALID_PERMISSION_REQUEST','PERMISSION_REQUEST_NOT_FOUND','FORBIDDEN','TIMER_ALREADY_STARTED','INVALID_TIMER_DURATION','SESSION_NOT_REOPENABLE']
  const room = roomCodes.find((code) => error.message.includes(code))
  return room ? new RoomError(room, error.message.replace(`${room}: `, '')) : error
}

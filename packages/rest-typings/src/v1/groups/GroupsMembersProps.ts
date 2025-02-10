import Ajv from 'ajv';

import type { PaginatedRequest } from '../../helpers/PaginatedRequest';
import type { GroupsBaseProps } from './BaseProps';
import { withGroupBaseProperties } from './BaseProps';

const ajv = new Ajv({
	coerceTypes: true,
});

export type GroupsMembersProps = PaginatedRequest<GroupsBaseProps & { filter?: string; status?: string[]; activeMembersOnly?: 'true' | 'false' | 1 | 0 }>;

const GroupsMembersPropsSchema = withGroupBaseProperties({
	offset: {
		type: 'number',
		nullable: true,
	},
	count: {
		type: 'number',
		nullable: true,
	},
	filter: {
		type: 'string',
		nullable: true,
	},
	status: {
		type: 'array',
		items: { type: 'string' },
		nullable: true,
	},
	activeMembersOnly: {
		type: 'boolean',
		nullable: true,
	},
});

export const isGroupsMembersProps = ajv.compile<GroupsMembersProps>(GroupsMembersPropsSchema);

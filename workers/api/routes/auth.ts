import { compose } from 'worktop';
import * as utils from 'worktop/utils';
import { send } from 'worktop/response';
import * as Email from 'lib/models/email';
import * as Password from 'lib/models/password';
import * as User from 'lib/models/user';

import type { Handler, Context } from 'lib/context';
import type { Credentials } from 'lib/models/user';
import type { TOKEN } from 'lib/models/password';

// TODO: email,password validations

/**
 * POST /auth/register
 */
export const register: Handler = async req => {
	const input = await utils.body<Credentials>(req);

	if (!input || !input.email || !input.password) {
		return send(400, 'TODO: port over validation lib');
	}

	// Check for existing user email
	const { email, password } = input;
	const userid = await Email.find(email);
	if (userid) return send(400, 'An account already exists for this address');

	const user = await User.insert({ email, password });
	if (!user) return send(500, 'Error creating account');

	const output = await User.tokenize(user);
	return send(201, output);
}

/**
 * POST /auth/login
 */
export const login: Handler = async req => {
	const input = await utils.body<Credentials>(req);

	if (!input || !input.email || !input.password) {
		return send(400, 'TODO: port over validation lib');
	}

	// the amibiguous error message to send
	const ambiguous = 'Invalid credentials';

	// Check for existing user email
	const { email, password } = input;
	const userid = await Email.find(email);
	if (!userid) return send(401, ambiguous);

	const user = await User.find(userid);
	if (!user) return send(401, ambiguous);

	const isMatch = await Password.compare(user, password);
	if (!isMatch) return send(401, ambiguous);

	const output = await User.tokenize(user);
	return send(200, output);
}

/**
 * POST /auth/refresh
 * Exchange a valid JWT for new JWT and `User` data
 */
export const refresh: Handler = compose<Context>(
	User.authenticate,
	async (req, context) => {
		// @ts-ignore – TODO(worktop)
		const user = req.user as User.User;
		const output = await User.tokenize(user);
		return send(200, output);
	}
);

/**
 * POST /auth/forgot
 * Initialize the Password Reset process
 */
export const forgot: Handler = async req => {
	type Input = { email?: string };
	const input = await utils.body<Input>(req);

	if (!input || !input.email) {
		return send(400, 'TODO: port over validation lib');
	}

	// the amibiguous message to send
	const ambiguous = 'A link to reset your password will be sent to your email address if an account exists';

	// Check for existing user email
	const userid = await Email.find(input.email);
	if (!userid) return send(200, ambiguous);

	const user = await User.find(userid);
	if (!user) return send(200, ambiguous);

	if (await Password.forgot(user)) return send(200, ambiguous);
	else return send(400, 'Error while resetting password');
}

/**
 * POST /auth/reset
 */
export const reset: Handler = async req => {
	type Input = Credentials & { token?: TOKEN };
	const input = await utils.body<Input>(req);

	if (!input || !input.email || !input.password || !input.token) {
		return send(400, 'TODO: port over validation lib');
	}

	// the amibiguous message to send
	const ambiguous = 'Invalid token';
	const { token, email, password } = input;

	const isValid = Password.isUID(token);
	if (!isValid) return send(400, ambiguous);

	const userid = await Password.find(token);
	if (!userid) return send(400, ambiguous);

	let user = await User.find(userid);
	if (!user) return send(400, ambiguous);

	if (user.email !== email) {
		return send(400, ambiguous);
	}

	// regenerate salt
	user = await User.update(user, { password });
	if (!user) return send(500, 'Error updating user document');

	const output = await User.tokenize(user);
	return send(200, output);
}

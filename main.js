const {app, BrowserWindow } = require('electron');
const url = require('url');
const path = require('path');
const { ipcMain } = require('electron');
const { net } = require('electron');

const storage = require('electron-json-storage');

let win

// process.on('uncaughtException',(x)=>{
// 		console.log("UncaughtException => " + x.message)
// });
let local_expenses_list_json = {};

function createWindow(){
	let access_token = "";

	win = new BrowserWindow(
		{
			width: 800,
			height: 600,
			webPreferences:{
				nodeIntegration: true
			}
		}
		)

	win.loadURL(url.format ({
		pathname: path.join(__dirname, 'index.html'),
		protocol: 'file',
		slashes: true
	}))
}

ipcMain.once('initial_check_session_state', (event, arg)=>{
// This listener checks for session state only when body loads.
	check_session_state(event, arg);
});

ipcMain.on('user_request_check_session_state', (event, arg)=>{
// This listener checks for session state when user requests.
	console.log("In check_session_state_ipc");
	check_session_state(event, arg);
})

function check_session_state(event, arg){
	console.log("In check_session_state_function");

	// Check if token exists
	storage.has('access_token_structure', function(error, hasKey){

		if(error) throw error;

		if(hasKey){
		// Offline Token Exists.
			storage.get('access_token_structure', function(error, data){
				if(error) throw error;

				access_token = data['access_token'];
				console.log("-> Offline Token Exists");
				// console.log(access_token);

				// Make a request to get user_details and check if token is valid.
				const user_details_request = net.request({
					method: "GET",
					url: "https://restem.pythonanywhere.com/users/",
				})
				user_details_request.setHeader('Authorization', "Bearer " + access_token)

				user_details_request.on("response", (response)=>{
					
					let response_data = "";

					console.log("STATUS: " +  response.statusCode);
					
					response.on("data", (chunk) =>{

						response_data = chunk;

						// A queryset filtered by pk is passed, so only one element and that is at 0 index.
						user_details = JSON.parse(response_data)[0]
						// console.log(user_details)

					response.on("end", ()=>{
						// If authentication success.
						if(response.statusCode == 200)
							// Show Home Page.
							event.sender.send("login_success", "Logging in as " + user_details['first_name']);
						
						// Else If authentication failed. 
						else{
							console.log("-> User Login Failed, Redirecting to Login Page");
							event.sender.send("login_failed", "Your Session Expired. please Login Again.");
							storage.clear(function(){
								if (error) throw error;
							});
						}
					})

					})
				})

				user_details_request.end()

				// If user is offline
				user_details_request.on("error", (error)=>{
					console.log(error);
					event.sender.send("user_offline", "You are offline.")
				});
				
			})
		}
		else{
		// Offline Token do not Exists.
			console.log("-> Offline Token Do Not Exists");
			event.sender.send("token_does_not_exist", "redirect_to_login_page");
		}
	})
}

ipcMain.on('login', (event, arg) => {

	console.log("->login event recieved.");


	// Convert the recieved object into JSON object.
	login_JSON = JSON.parse(arg);

	username = login_JSON['username'];
	password = login_JSON['password'];

	// Authenticate and get the token from API.

	const login_request = net.request({
		method: "POST",
		url: "https://restem.pythonanywhere.com/o/token/",
	});

	let client_id = "0YWvWYPfAEaIPDoo7uEnaKLW7TkzcAbzLPptBd3C";
	let client_secret = "Lc4cLD2TSxtrq0emDddxfq76RwRdFWsuEA0vWS6UbeTYo3FAQKiL5ZSicwVvG6TVeuvzb6tPb5LQyTTfvbaVXVkAFjKIDEe2cexRZYLST7QOcVllRLcVUpdOMNcMLGwH";

	login_request.setHeader('Authorization', "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"));
	login_request.setHeader('content-type', 'application/x-www-form-urlencoded');

	login_request.write("grant_type=password&username=" + username + "&password=" + password);

	// console.log(login_request)

	login_request.on("response", (response)=>{
		console.log("STATUS: " +  response.statusCode);
		// console.log("HEADERS: " +  JSON.stringify(response.headers));
		
		let response_data = "";

		response.on("data", (chunk) =>{
			// console.log("BODY: " + chunk);
			response_data = chunk;
			response_data = JSON.parse(response_data)
			access_token = response_data['access_token']
			// console.log(response_data)

		})
		response.on("end", ()=>{
			// If auth success.
			if(response.statusCode == 200){
				// console.log(response_data)

				// Store token in storage for future use.
				storage.set('access_token_structure', response_data, function(){
					console.log("Token stored in electron-json-storage");
					// console.log("saved");
				})
				
				event.sender.send('login_success', "Login Successful.")
				console.log("login_success sent");
			}
				

			// If auth failed.
			else if(response.statusCode == 401){
				event.sender.send('login_failed', "Your Client is unauthorized.")
				console.log("login_failed sent");
			}
			else{
				event.sender.send('login_failed', response_data['error_description']);
				console.log("login_failed sent");
			}
		});
	})
	login_request.end()

	login_request.on("error", (error)=>{
		console.log(error);
		event.sender.send("user_offline", "You are offline.");
		console.log("user_offline sent");
	})
})

ipcMain.on('fetch_expenses_list' ,(event, arg) =>{
	console.log("fetch_expenses_list recieved.")

	// After expenses list is fetched,
	// home_page is loaded.

	// If unable to fetch expenses list.
	// Show the cached expenses list.

	const fetch_expenses_list = net.request({
		method: "GET",
		url: "https://restem.pythonanywhere.com/expenses/",
	})
	fetch_expenses_list.setHeader('Authorization', "Bearer " + access_token)

	fetch_expenses_list.on("response", (response)=>{
		console.log("STATUS: " +  response.statusCode);

		response.setEncoding("utf8");

		var data = "";
		
		response.on("data", (chunk) =>{

			data += chunk

		})

		response.on("end", (chunk) =>{
			// Parse data as JSON
			local_expenses_list_json = JSON.parse(data)
			// console.log(local_expenses_list_json)
			// console.log(data)

			if(response.statusCode == 200){

				win.loadURL(url.format ({
					pathname: path.join(__dirname, 'home_page.html'),
					protocol: 'file',
					slashes: true
				}));

				win.webContents.send("expenses_list", local_expenses_list_json);
			}
			else{
				console.log("Error Fetching Expenses List");
			}
		})
	})

	fetch_expenses_list.end()


	fetch_expenses_list.on("error", (error)=>{

		console.log(error);
		event.sender.send("user_offline", "You are offline.")
	});
})

ipcMain.on('send_expenses_list' ,(event, arg) =>{
	console.log("send_expenses_list recieved.")
	event.sender.send("send_expenses_list", local_expenses_list_json);
})

ipcMain.on('logout' ,(event, arg) =>{
	// 1. Send a request to delete access_token.
	// 2. On completion delete local access_token and expenses-list.
	// 3. Notify renderer process.

	const logout_request = net.request({
		method: "POST",
		url: "https://restem.pythonanywhere.com/o/revoke_token/",
	});

	let client_id = "0YWvWYPfAEaIPDoo7uEnaKLW7TkzcAbzLPptBd3C";
	let client_secret = "Lc4cLD2TSxtrq0emDddxfq76RwRdFWsuEA0vWS6UbeTYo3FAQKiL5ZSicwVvG6TVeuvzb6tPb5LQyTTfvbaVXVkAFjKIDEe2cexRZYLST7QOcVllRLcVUpdOMNcMLGwH";

	logout_request.setHeader('content-type', 'application/x-www-form-urlencoded');

	logout_request.write("token=" + access_token + "&client_id=" + client_id + "&client_secret=" + client_secret);

	// console.log(logout_request)

	logout_request.on("response", (response)=>{
		console.log("STATUS: " +  response.statusCode);
		// console.log("HEADERS: " +  JSON.stringify(response.headers));

		if(response.statusCode == 200){
			// Logout Successful.
			// Deleting local token and expenses-list.
			storage.remove('access_token_structure', (error)=>{
				if (error) throw error;

				event.sender.send("logout_success", "");
				console.log("logout_success sent");
			})
		}
				

		// If logout failed.
		else{
			event.sender.send('logout_failed', response_data['error_description']);
			console.log("logout_failed sent");
		}
	})
	logout_request.end()

	logout_request.on("error", (error)=>{
		console.log(error);
		event.sender.send("user_offline", "You are offline.");
		console.log("user_offline sent");
	})
})

ipcMain.on('registration', (event, arg) => {

	console.log("->registration event recieved.");


	// Convert the recieved object into JSON object.
	registration_JSON = JSON.parse(arg);

	console.log(registration_JSON);

	first_name = registration_JSON['first_name'];
	last_name = registration_JSON['last_name'];
	email = registration_JSON['email'];
	username = registration_JSON['username'];
	password = registration_JSON['password'];

	const registration_request = net.request({
		method: "POST",
		url: "https://restem.pythonanywhere.com/users/",
	});

	registration_request.setHeader('content-type', 'application/json');

	// console.log(JSON.stringify(registration_JSON))

	registration_request.write(JSON.stringify(registration_JSON));

	// console.log(registration_request)

	registration_request.on("response", (response)=>{
		console.log("STATUS: " +  response.statusCode);

		let response_data = "";
		// console.log("HEADERS: " +  JSON.stringify(response.headers));
		

		response.on("data", (chunk) =>{
			// console.log("BODY: " + chunk);
			response_data = chunk;

			console.log(response_data.toString())

			response_data = JSON.parse(response_data)

			console.log(response_data)

		})
		response.on("end", ()=>{
			// If user created
			if(response.statusCode == 201){
				
				event.sender.send('registration_success', "Registration Successful.")
				console.log("registration_success sent");
			}
				

			// If registration failed.
			else if(response.statusCode == 401){
				event.sender.send('registration_failed', "Your Client is unauthorized.")
				console.log("registration_failed sent");
			}
			else{

				event.sender.send('registration_failed', response_data);
				console.log("registration_failed sent");
			}
		})
	})
	registration_request.end()

	registration_request.on("error", (error)=>{
		console.log(error);
		event.sender.send("user_offline", "You are offline.");
		console.log("user_offline sent");
	})
})

ipcMain.on("add_expense", (event, arg)=>{
	// Check if token exists
	storage.has('access_token_structure', function(error, hasKey){

		if(error) throw error;

		if(hasKey){
		// Offline Token Exists.
			storage.get('access_token_structure', function(error, data){
				if(error) throw error;

				access_token = data['access_token'];
				console.log("-> Offline Token Exists");
				// console.log(access_token);

				// Convert the recieved object into JSON object.
				expense_JSON = JSON.parse(arg);

				// console.log(expense_JSON);

				title = expense_JSON['title'];
				date = expense_JSON['date'];
				amount = expense_JSON['amount'];

				const add_new_expense = net.request({
					method: "POST",
					url: "https://restem.pythonanywhere.com/expenses/",
				})


				add_new_expense.setHeader('Authorization', "Bearer " + access_token)
				add_new_expense.setHeader('content-type', 'application/json');

				// console.log(JSON.stringify(expense_JSON))

				add_new_expense.write(JSON.stringify(expense_JSON));

				// console.log(add_new_expense);

				add_new_expense.on("response", (response)=>{
					
					let response_data = "";

					console.log("STATUS: " +  response.statusCode);
					
					response.on("data", (chunk) =>{

						response_data = chunk;

					response.on("end", ()=>{
						if(response.statusCode == 201){
							//  201 -> Created, in case of POSTs.
							event.sender.send("add_expense_success", "Expense Added Successfully");
						}
						else{
							console.log("-> Unable to add expense");
							event.sender.send("add_expense_failed", "Unable to add expense");
						}
					})

					})
				})

				add_new_expense.end()

				// If user is offline
				add_new_expense.on("error", (error)=>{
					console.log(error);
					event.sender.send("user_offline", "You are offline.")
				});
				
			})
		}
		else{
		// Offline Token do not Exists.
			console.log("-> Offline Token Do Not Exists");
			event.sender.send("token_does_not_exist", "redirect_to_login_page");
		}
	})
})

app.on('ready', createWindow)
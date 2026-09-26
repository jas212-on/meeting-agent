import dotenv from "dotenv";
dotenv.config();

const API_BASE = "http://127.0.0.1:3001/api";

async function runTest() {
  console.log("🧪 Starting Group & Meeting Sharing Verification Test...\n");

  const ts = Date.now();
  const adminEmail = `admin_${ts}@test.com`;
  const memberEmail = `member_${ts}@test.com`;
  const password = "password123";

  // 1. Register Admin
  console.log("1. Registering Admin user:", adminEmail);
  const regAdminRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alpha Admin", email: adminEmail, password }),
  });
  const adminData = await regAdminRes.json();
  if (!regAdminRes.ok) throw new Error(`Admin reg failed: ${JSON.stringify(adminData)}`);
  const adminToken = adminData.token;
  console.log("   ✓ Admin registered with token:", adminToken.substring(0, 15) + "...");

  // 2. Register Member
  console.log("\n2. Registering Member user:", memberEmail);
  const regMemberRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Beta Member", email: memberEmail, password }),
  });
  const memberData = await regMemberRes.json();
  if (!regMemberRes.ok) throw new Error(`Member reg failed: ${JSON.stringify(memberData)}`);
  const memberToken = memberData.token;
  const memberId = memberData.user.id;
  console.log("   ✓ Member registered, ID:", memberId);

  // 3. Admin lists registered users
  console.log("\n3. Fetching registered users via GET /api/auth/users...");
  const usersRes = await fetch(`${API_BASE}/auth/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const usersData = await usersRes.json();
  console.log(`   ✓ Found ${usersData.count} registered users.`);
  const foundMember = usersData.users.find((u: any) => u.email === memberEmail);
  if (!foundMember) throw new Error("Member not in registered users list!");
  console.log("   ✓ Member properly found in registered users list.");

  // 4. Admin creates a group with Member added
  console.log("\n4. Admin creating a group with Member...");
  const createGroupRes = await fetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: `Sprint Team ${ts}`,
      description: "Automated group test for meet sharing",
      memberIds: [memberId],
    }),
  });
  const createGroupData = await createGroupRes.json();
  if (!createGroupRes.ok) throw new Error(`Group create failed: ${JSON.stringify(createGroupData)}`);
  const groupId = createGroupData.group.id;
  console.log(`   ✓ Group created successfully! ID: ${groupId}, Name: ${createGroupData.group.name}`);
  console.log(`   ✓ Admin is: ${createGroupData.group.admin.name}, Members count: ${createGroupData.group.members.length}`);

  // 5. Verify group is visible to Admin
  console.log("\n5. Admin fetching their groups...");
  const adminGroupsRes = await fetch(`${API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGroupsData = await adminGroupsRes.json();
  const groupForAdmin = adminGroupsData.groups.find((g: any) => g.id === groupId);
  if (!groupForAdmin || !groupForAdmin.isAdmin) {
    throw new Error("Group not found or isAdmin is false for creator!");
  }
  console.log("   ✓ Admin sees group with isAdmin = true.");

  // 6. Verify group is visible to Member
  console.log("\n6. Member fetching their groups...");
  const memberGroupsRes = await fetch(`${API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${memberToken}` },
  });
  const memberGroupsData = await memberGroupsRes.json();
  const groupForMember = memberGroupsData.groups.find((g: any) => g.id === groupId);
  if (!groupForMember) {
    throw new Error("Member CANNOT see the group they were added to!");
  }
  if (groupForMember.isAdmin) {
    throw new Error("Member should not have isAdmin = true!");
  }
  console.log(`   ✓ Member sees group! Admin listed as: ${groupForMember.admin.name}, isAdmin = false.`);

  // 7. Admin shares a Google Meet link
  console.log("\n7. Admin sharing Google Meet link...");
  const testMeetUrl = "https://meet.google.com/xyz-qwer-tyu";
  const shareRes = await fetch(`${API_BASE}/groups/${groupId}/meeting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ url: testMeetUrl }),
  });
  const shareData = await shareRes.json();
  if (!shareRes.ok) throw new Error(`Share failed: ${JSON.stringify(shareData)}`);
  console.log("   ✓ Meeting link shared:", shareData.activeMeeting.url);

  // 8. Member fetches group to see active meet link
  console.log("\n8. Member fetching group to verify live meet link...");
  const memberCheckRes = await fetch(`${API_BASE}/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${memberToken}` },
  });
  const memberCheckData = await memberCheckRes.json();
  if (
    !memberCheckData.group.activeMeeting ||
    memberCheckData.group.activeMeeting.url !== testMeetUrl
  ) {
    throw new Error("Member does NOT see the active meeting link!");
  }
  console.log("   ✓ Member can access the live meeting link:", memberCheckData.group.activeMeeting.url);

  // 9. Clean up test group
  console.log("\n9. Admin deleting test group...");
  const delRes = await fetch(`${API_BASE}/groups/${groupId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!delRes.ok) throw new Error("Delete failed");
  console.log("   ✓ Test group cleaned up.");

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! Groups, registered users, and meet sharing working as requested.");
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
